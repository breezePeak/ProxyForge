/**
 * proxy-anthropic.cjs — Anthropic-compatible protocol handler.
 *
 * Translates incoming Anthropic-format requests to Kiro backend format,
 * and formats Kiro responses back to Anthropic Messages format.
 *
 * Handles Anthropic's content block structure ([{type: "text", text: "..."}])
 * and system prompt as a separate top-level field.
 *
 * Interface contract (per proxy-shared.cjs):
 *   export: { handleMessages(req, res, account, forwardFn), handleListModels(req, res, account) }
 *
 * forwardFn signature:
 *   await forwardFn(account, { model, messages, system, ...params })
 *     → { content, model, stop_reason, usage: { input_tokens, output_tokens } }
 *
 *   await forwardFn(account, { model, messages, system, ...params }, { onToken, onComplete, onError })
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

/** Generate a random id string. */
function generateId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Strip undefined/null values from an object. */
function stripUndefined(obj) {
  var out = {};
  for (var k in obj) {
    if (obj.hasOwnProperty(k) && obj[k] !== undefined && obj[k] !== null) {
      out[k] = obj[k];
    }
  }
  return out;
}

// ─── Content extraction / normalization ──────────────────────────────────────

/**
 * Extract plain text from an Anthropic content value.
 * Handles both simple string and content block array formats.
 *
 * @param {string|Array} content - Message content (string or [{type:"text", text:"..."}])
 * @returns {string}
 */
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    var parts = [];
    for (var i = 0; i < content.length; i++) {
      var block = content[i];
      if (block && block.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      }
      // Skip images and other non-text blocks for Kiro compatibility
    }
    return parts.join('\n');
  }
  return '';
}

/**
 * Extract system prompt from Anthropic request body.
 * Handles both string and content block array formats.
 *
 * @param {object} body - Parsed request body
 * @returns {string|null}
 */
function extractSystem(body) {
  if (!body.system) return null;
  if (typeof body.system === 'string') return body.system;
  if (Array.isArray(body.system)) {
    var parts = [];
    for (var i = 0; i < body.system.length; i++) {
      var block = body.system[i];
      if (block && block.type === 'text' && typeof block.text === 'string') {
        parts.push(block.text);
      }
    }
    return parts.join('\n');
  }
  return null;
}

/**
 * Normalize Anthropic messages to a flat { role, content } format for Kiro.
 * Converts content blocks to plain text strings.
 *
 * @param {Array}  messages - Anthropic messages array [{role, content}]
 * @param {string} system   - Extracted system prompt string
 * @returns {Array}         - Normalized messages array
 */
function normalizeMessages(messages, system) {
  var result = [];

  // Prepend system message if present
  if (system) {
    result.push({ role: 'system', content: system });
  }

  for (var i = 0; i < messages.length; i++) {
    var msg = messages[i];
    var content = extractText(msg.content);
    result.push({ role: msg.role, content: content });
  }

  return result;
}

// ─── Error formatting ────────────────────────────────────────────────────────

/**
 * Send an Anthropic-formatted error response.
 */
function sendError(res, statusCode, message, errorType) {
  var body = {
    type: 'error',
    error: {
      type: errorType || 'api_error',
      message: message || 'Internal server error'
    }
  };
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

// ─── Non-streaming handler ───────────────────────────────────────────────────

/**
 * Handle a non-streaming messages request.
 */
async function handleNonStreaming(req, res, account, forwardFn, body) {
  var kiroModel = mapModel(body.model, 'anthropic', 'kiro');
  var system = extractSystem(body);
  var messages = normalizeMessages(body.messages || [], system);

  var kiroReq = stripUndefined({
    model: kiroModel,
    messages: messages,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
    stop_sequences: body.stop_sequences
  });

  var kiroResp;
  try {
    kiroResp = await forwardFn(account, kiroReq);
  } catch (err) {
    sendError(res, 502, 'Upstream request failed: ' + (err.message || 'Unknown error'), 'overloaded_error');
    return;
  }

  var inputTokens = (kiroResp.usage && kiroResp.usage.input_tokens) ? kiroResp.usage.input_tokens : 0;
  var outputTokens = (kiroResp.usage && kiroResp.usage.output_tokens) ? kiroResp.usage.output_tokens : 0;

  var response = {
    id: generateId('msg'),
    type: 'message',
    role: 'assistant',
    content: [{
      type: 'text',
      text: kiroResp.content || ''
    }],
    model: body.model || 'claude-sonnet-4-20250514',
    stop_reason: kiroResp.stop_reason || mapFinishReason(kiroResp.finish_reason),
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens
    }
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

/** Map OpenAI-style finish_reason to Anthropic stop_reason. */
function mapFinishReason(finishReason) {
  if (!finishReason) return 'end_turn';
  switch (finishReason) {
    case 'stop': return 'end_turn';
    case 'length': return 'max_tokens';
    default: return finishReason;
  }
}

// ─── Streaming handler ───────────────────────────────────────────────────────

/**
 * Handle a streaming messages request using Anthropic's event format.
 */
function handleStreaming(req, res, account, forwardFn, body) {
  var kiroModel = mapModel(body.model, 'anthropic', 'kiro');
  var system = extractSystem(body);
  var messages = normalizeMessages(body.messages || [], system);

  var kiroReq = stripUndefined({
    model: kiroModel,
    messages: messages,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    top_p: body.top_p,
    stop_sequences: body.stop_sequences,
    stream: true
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  var msgId = generateId('msg');
  var modelName = body.model || 'claude-sonnet-4-20250514';
  var finished = false;
  var firstToken = true;
  var contentAccum = '';

  function writeEvent(event, data) {
    if (finished) return;
    res.write('event: ' + event + '\n');
    res.write('data: ' + JSON.stringify(data) + '\n\n');
  }

  // Send message_start immediately
  writeEvent('message_start', {
    type: 'message_start',
    message: {
      id: msgId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: modelName,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 }
    }
  });

  // Send content_block_start (empty text block)
  writeEvent('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: {
      type: 'text',
      text: ''
    }
  });

  forwardFn(account, kiroReq, {
    onToken: function (token) {
      if (finished) return;
      contentAccum += token;
      writeEvent('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: token
        }
      });
      firstToken = false;
    },
    onComplete: function (usage) {
      if (finished) return;
      var outputTokens = (usage && usage.output_tokens) ? usage.output_tokens : 0;
      var inputTokens = (usage && usage.input_tokens) ? usage.input_tokens : 0;

      // content_block_stop
      writeEvent('content_block_stop', {
        type: 'content_block_stop',
        index: 0
      });

      // message_delta with final stop_reason and output_tokens
      writeEvent('message_delta', {
        type: 'message_delta',
        delta: {
          stop_reason: 'end_turn',
          stop_sequence: null
        },
        usage: {
          output_tokens: outputTokens
        }
      });

      // message_stop
      writeEvent('message_stop', {
        type: 'message_stop'
      });

      finished = true;
      res.end();
    },
    onError: function (err) {
      if (finished) return;
      writeEvent('error', {
        type: 'error',
        error: {
          type: 'stream_error',
          message: err.message || 'Stream error'
        }
      });
      finished = true;
      res.end();
    }
  }).catch(function (err) {
    if (finished) return;
    writeEvent('error', {
      type: 'error',
      error: {
        type: 'stream_error',
        message: err.message || 'Upstream stream error'
      }
    });
    finished = true;
    res.end();
  });
}

// ─── Public handlers ─────────────────────────────────────────────────────────

/**
 * Handle an Anthropic-compatible messages request.
 *
 * Parses the incoming request body, normalizes content blocks and system prompt,
 * maps the model name, forwards to Kiro, and formats the response as an
 * Anthropic Message (or event-stream for streaming).
 *
 * @param {http.IncomingMessage} req  - The incoming HTTP request
 * @param {http.ServerResponse}  res  - The outgoing HTTP response
 * @param {object}               account - Account object (per proxy-shared.cjs)
 * @param {function}             forwardFn - (account, params, [callbacks]) => Promise
 */
async function handleMessages(req, res, account, forwardFn) {
  var body;
  try {
    body = await readRequestBody(req);
  } catch (e) {
    sendError(res, 400, 'Invalid JSON in request body', 'invalid_request_error');
    return;
  }

  // Validate required fields
  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    sendError(res, 400, 'Missing or empty "messages" array', 'invalid_request_error');
    return;
  }

  if (!body.max_tokens && !body.stream) {
    sendError(res, 400, 'Missing required field "max_tokens"', 'invalid_request_error');
    return;
  }

  if (body.stream === true) {
    handleStreaming(req, res, account, forwardFn, body);
  } else {
    await handleNonStreaming(req, res, account, forwardFn, body);
  }
}

/**
 * Handle an Anthropic-compatible model listing request.
 *
 * Returns the available models (from the account or defaults) formatted
 * as an Anthropic model list response.
 *
 * @param {http.IncomingMessage} req  - The incoming HTTP request
 * @param {http.ServerResponse}  res  - The outgoing HTTP response
 * @param {object}               account - Account object (per proxy-shared.cjs)
 */
async function handleListModels(req, res, account) {
  var kiroModels = (account && account.availableModels && account.availableModels.length > 0)
    ? account.availableModels
    : undefined;

  var response = listModels('anthropic', kiroModels);

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(response));
}

module.exports = {
  handleMessages: handleMessages,
  handleListModels: handleListModels
};
