/**
 * proxy-openai.cjs — OpenAI-compatible protocol handler.
 *
 * Translates incoming OpenAI-format requests to Kiro backend format,
 * and formats Kiro responses back to OpenAI Chat Completion format.
 *
 * Interface contract (per proxy-shared.cjs):
 *   export: { handleChatCompletion(req, res, account, forwardFn), handleListModels(req, res, account) }
 *
 * forwardFn signature:
 *   await forwardFn(account, { model, messages, ...params })
 *     → { content, model, finish_reason, usage: { input_tokens, output_tokens } }
 *
 *   await forwardFn(account, { model, messages, ...params }, { onToken, onComplete, onError })
 *     → streaming via callbacks
 */

'use strict';

const { mapModel, listModels } = require('./model-mapper.cjs');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Read and parse JSON request body from the incoming HTTP request. */
function readRequestBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end', function () {
      try {
        var raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

/** Generate a random id string matching the protocol's id format. */
function generateId(prefix) {
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Extract non-message parameters from an OpenAI request body. */
function extractParams(body) {
  return {
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
    frequency_penalty: body.frequency_penalty,
    presence_penalty: body.presence_penalty,
    stop: body.stop,
    n: body.n,
    user: body.user
  };
}

/** Strip undefined values from an object. */
function stripUndefined(obj) {
  var out = {};
  for (var k in obj) {
    if (obj.hasOwnProperty(k) && obj[k] !== undefined && obj[k] !== null) {
      out[k] = obj[k];
    }
  }
  return out;
}

// ─── Error formatting ────────────────────────────────────────────────────────

/**
 * Send an OpenAI-formatted error response.
 */
function sendError(res, statusCode, message, type, code) {
  var body = {
    error: {
      message: message || 'Internal server error',
      type: type || 'server_error',
      code: code || 'internal_error'
    }
  };
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ─── Non-streaming handler ───────────────────────────────────────────────────

/**
 * Handle a non-streaming chat completion request.
 */
async function handleNonStreaming(req, res, account, forwardFn, body) {
  var kiroModel = mapModel(body.model, 'openai', 'kiro');
  var messages = body.messages || [];
  var params = extractParams(body);

  var kiroReq = stripUndefined({
    model: kiroModel,
    messages: messages,
    temperature: params.temperature,
    max_tokens: params.max_tokens,
    top_p: params.top_p,
    stop: params.stop
  });

  var kiroResp;
  try {
    kiroResp = await forwardFn(account, kiroReq);
  } catch (err) {
    sendError(res, 502, 'Upstream request failed: ' + (err.message || 'Unknown error'), 'upstream_error', 'bad_gateway');
    return;
  }

  // Build OpenAI-format response
  var id = generateId('chatcmpl');
  var promptTokens = (kiroResp.usage && kiroResp.usage.input_tokens) ? kiroResp.usage.input_tokens : 0;
  var completionTokens = (kiroResp.usage && kiroResp.usage.output_tokens) ? kiroResp.usage.output_tokens : 0;
  var totalTokens = promptTokens + completionTokens;

  var response = {
    id: id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model || 'gpt-4o',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: kiroResp.content || ''
      },
      finish_reason: kiroResp.finish_reason || 'stop'
    }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens
    }
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

// ─── Streaming handler ───────────────────────────────────────────────────────

/**
 * Handle a streaming chat completion request via Server-Sent Events.
 */
function handleStreaming(req, res, account, forwardFn, body) {
  var kiroModel = mapModel(body.model, 'openai', 'kiro');
  var messages = body.messages || [];
  var params = extractParams(body);

  var kiroReq = stripUndefined({
    model: kiroModel,
    messages: messages,
    temperature: params.temperature,
    max_tokens: params.max_tokens,
    top_p: params.top_p,
    stop: params.stop,
    stream: true
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  var chatId = generateId('chatcmpl');
  var createdTs = Math.floor(Date.now() / 1000);
  var modelName = body.model || 'gpt-4o';
  var contentAccum = '';
  var usageAccum = null;
  var finished = false;

  function writeChunk(data) {
    if (finished) return;
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  }

  function sendDone() {
    if (finished) return;
    finished = true;
    res.write('data: [DONE]\n\n');
    res.end();
  }

  forwardFn(account, kiroReq, {
    onToken: function (token) {
      if (finished) return;
      contentAccum += token;
      writeChunk({
        id: chatId,
        object: 'chat.completion.chunk',
        created: createdTs,
        model: modelName,
        choices: [{
          index: 0,
          delta: { content: token },
          finish_reason: null
        }]
      });
    },
    onComplete: function (usage) {
      if (finished) return;
      usageAccum = usage;
      var promptTok = (usage && usage.input_tokens) ? usage.input_tokens : 0;
      var completionTok = (usage && usage.output_tokens) ? usage.output_tokens : 0;
      // Send final chunk with finish_reason
      writeChunk({
        id: chatId,
        object: 'chat.completion.chunk',
        created: createdTs,
        model: modelName,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: promptTok,
          completion_tokens: completionTok,
          total_tokens: promptTok + completionTok
        }
      });
      sendDone();
    },
    onError: function (err) {
      if (finished) return;
      writeChunk({
        error: {
          message: err.message || 'Stream error',
          type: 'server_error',
          code: 'stream_error'
        }
      });
      sendDone();
    }
  }).catch(function (err) {
    if (finished) return;
    writeChunk({
      error: {
        message: err.message || 'Upstream stream error',
        type: 'server_error',
        code: 'stream_error'
      }
    });
    sendDone();
  });
}

// ─── Public handlers ─────────────────────────────────────────────────────────

/**
 * Handle an OpenAI-compatible chat completion request.
 *
 * Parses the incoming request body, maps the model name, forwards to Kiro,
 * and formats the response as an OpenAI Chat Completion (or SSE stream).
 *
 * @param {http.IncomingMessage} req  - The incoming HTTP request
 * @param {http.ServerResponse}  res  - The outgoing HTTP response
 * @param {object}               account - Account object (per proxy-shared.cjs)
 * @param {function}             forwardFn - (account, params, [callbacks]) => Promise
 */
async function handleChatCompletion(req, res, account, forwardFn) {
  var body;
  try {
    body = await readRequestBody(req);
  } catch (e) {
    sendError(res, 400, 'Invalid JSON in request body', 'invalid_request_error', 'parse_error');
    return;
  }

  // Validate required fields
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    sendError(res, 400, 'Missing or empty "messages" array', 'invalid_request_error', 'missing_field');
    return;
  }

  if (body.stream === true) {
    handleStreaming(req, res, account, forwardFn, body);
  } else {
    await handleNonStreaming(req, res, account, forwardFn, body);
  }
}

/**
 * Handle an OpenAI-compatible model listing request.
 *
 * Returns the available models (from the account or defaults) formatted
 * as an OpenAI /v1/models response.
 *
 * @param {http.IncomingMessage} req  - The incoming HTTP request
 * @param {http.ServerResponse}  res  - The outgoing HTTP response
 * @param {object}               account - Account object (per proxy-shared.cjs)
 */
async function handleListModels(req, res, account) {
  var kiroModels = (account && account.availableModels && account.availableModels.length > 0)
    ? account.availableModels
    : undefined;

  var response = listModels('openai', kiroModels);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

module.exports = {
  handleChatCompletion: handleChatCompletion,
  handleListModels: handleListModels
};
