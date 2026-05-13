/**
 * proxy-server.cjs — HTTP API 反向代理服务器
 * 
 * 纯 Node.js 内置 http 模块实现，零外部依赖。
 * 路由分发 → CORS 处理 → 请求体解析 → 协议处理器 → 响应（含 SSE 流式）
 * 
 * 与 proxy-shared.cjs 配合:
 *   DEFAULT_CONFIG.host/port 作为监听地址默认值
 *   协议处理器稍后加入（proxy-openai.cjs, proxy-anthropic.cjs），
 *   缺失时返回 501 Not Implemented
 */

const http = require('http');
const { DEFAULT_CONFIG } = require('./proxy-shared.cjs');

// ─── 路由层（延迟加载） ───
let proxyRouter = null;
try {
  proxyRouter = require('./proxy-router.cjs');
} catch (err) {
  console.error('[proxy-server] Failed to load proxy-router:', err.message);
}

// ─── 账号数据源 ───
let accountsData = { accounts: [], providers: [] };
function setAccounts(data) {
  accountsData = data || { accounts: [], providers: [] };
}
function getAccounts() {
  return accountsData.accounts || [];
}
function getProviders() {
  return accountsData.providers || [];
}

// ─── 协议处理器（延迟加载，允许缺失） ───
const protocolHandlers = {};

function loadHandler(modulePath, key) {
  try {
    protocolHandlers[key] = require(modulePath);
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') {
      console.error(`[proxy-server] Failed to load ${modulePath}:`, err.message);
    }
    protocolHandlers[key] = null;
  }
}

loadHandler('./proxy-openai.cjs', 'openai');
loadHandler('./proxy-anthropic.cjs', 'anthropic');

// ─── 服务器状态 ───
let server = null;
let config = null;
let requestCount = 0;

// ─── 工具函数 ───
function parseJsonBody(req) {
  return new Promise((resolve) => {
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
      return resolve(null);
    }
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return resolve(null);
    }
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw || !raw.trim()) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (_err) {
        resolve(raw);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Account-Id, X-Timeout, X-Model, X-Stream');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, message, type, code) {
  sendJson(res, statusCode, {
    error: {
      message: String(message),
      type: type || 'proxy_error',
      code: code || 'UNKNOWN'
    }
  });
}

function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── 路由表 ───
const routeTable = [
  { method: 'POST',   path: '/v1/chat/completions', handler: 'handleChatCompletion', module: 'openai' },
  { method: 'POST',   path: '/v1/messages',          handler: 'handleMessages',        module: 'anthropic' },
  { method: 'GET',    path: '/v1/models',             handler: 'handleModelList',       module: 'openai' },
  { method: 'GET',    path: '/health',                handler: null                    },
];

function matchRoute(method, urlPath) {
  for (const route of routeTable) {
    if (route.method === method && route.path === urlPath) {
      return route;
    }
  }
  return null;
}

// ─── 日志 ───
function logRequest(method, path, accountId, status, durationMs, extra) {
  const parts = [
    `[proxy] ${method} ${path}`,
    accountId ? `account=${accountId}` : 'account=none',
    `status=${status}`,
    `${durationMs}ms`
  ];
  if (extra) parts.push(extra);
  console.log(parts.join(' '));
}

// ─── 主请求处理器 ───
async function handleRequest(req, res) {
  const startTime = Date.now();
  const reqId = generateRequestId();
  requestCount++;

  const accountId = (req.headers['x-account-id'] || '').trim() || null;
  let statusCode = 200;
  let extra = '';

  try {
    // CORS 预检
    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.writeHead(204);
      res.end();
      logRequest('OPTIONS', req.url, accountId, 204, Date.now() - startTime);
      return;
    }

    const urlPath = new URL(req.url, `http://${config.host}:${config.port}`).pathname;

    // 健康检查
    if (req.method === 'GET' && urlPath === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        uptime: process.uptime(),
        requests: requestCount,
        version: '1.0.0'
      });
      logRequest(req.method, urlPath, accountId, 200, Date.now() - startTime);
      return;
    }

    // 路由匹配
    const route = matchRoute(req.method, urlPath);
    if (!route) {
      statusCode = 404;
      sendError(res, 404, `No route for ${req.method} ${urlPath}`, 'not_found', 'NO_ROUTE');
      logRequest(req.method, urlPath, accountId, 404, Date.now() - startTime);
      return;
    }

    // 协议处理器缺失检查
    if (route.module && (!protocolHandlers[route.module] || !protocolHandlers[route.module][route.handler])) {
      const missing = route.module;
      statusCode = 501;
      sendJson(res, 501, {
        error: {
          message: `${missing} protocol handler not available. Module proxy-${missing}.cjs is missing or has no '${route.handler}' export.`,
          type: 'not_implemented',
          code: 'HANDLER_MISSING'
        }
      });
      logRequest(req.method, urlPath, accountId, 501, Date.now() - startTime, `handler_missing=${missing}`);
      return;
    }

    // 解析请求体
    const body = await parseJsonBody(req);
    const timeoutMs = parseInt(req.headers['x-timeout'] || String(config.requestTimeout || 120000), 10);

    // 调用协议处理器
    if (route.module && route.handler) {
      const handler = protocolHandlers[route.module][route.handler];
      if (!proxyRouter) {
        statusCode = 503;
        sendError(res, 503, 'Proxy router not available', 'service_unavailable', 'ROUTER_MISSING');
        return;
      }

      // 解析目标账号
      const allAccounts = getAccounts();
      const allProviders = getProviders();
      const account = proxyRouter.resolveAccount(req, allAccounts, allProviders);
      if (!account) {
        statusCode = 503;
        sendError(res, 503, 'No available account for proxy. Ensure providers are enabled and accounts have availableModels.', 'service_unavailable', 'NO_ACCOUNT');
        return;
      }

      // 创建 forwardFn
      const forwardFn = (acc, reqBody, callbacks) => {
        return proxyRouter.forwardToKiro(acc, reqBody, null, null, callbacks);
      };

      await handler(req, res, account, forwardFn);
    } else {
      statusCode = 500;
      sendError(res, 500, 'Internal routing error', 'internal', 'ROUTE_CONFIG_ERROR');
    }
  } catch (err) {
    statusCode = err.statusCode || 500;
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendError(res, statusCode, errorMessage, 'internal', 'REQUEST_HANDLER_ERROR');
    extra = `err=${errorMessage.slice(0, 80)}`;
    console.error(`[proxy-server] Request error (${req.method} ${req.url}):`, errorMessage);
  }

  const duration = Date.now() - startTime;
  logRequest(req.method, req.url, accountId, statusCode, duration, extra);
}

// ─── 公开 API ───
function startServer(customConfig) {
  config = { ...DEFAULT_CONFIG, ...customConfig };

  server = http.createServer(handleRequest);

  server.on('error', (err) => {
    console.error('[proxy-server] Server error:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`[proxy-server] Port ${config.port} is already in use.`);
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(config.port, config.host, () => {
      console.log(`[proxy-server] Listening on http://${config.host}:${config.port}`);
      resolve(server);
    });

    server.once('error', reject);
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }

    // 停止接受新连接
    server.close(() => {
      console.log('[proxy-server] Server stopped');
      server = null;
      config = null;
      resolve();
    });

    // 强制关闭现有连接（等待最多 5 秒）
    setTimeout(() => {
      if (server) {
        server.closeAllConnections();
        server = null;
        config = null;
        resolve();
      }
    }, 5000);
  });
}

function getStatus() {
  return {
    running: !!server,
    host: config?.host || null,
    port: config?.port || null,
    requestCount
  };
}

module.exports = {
  startServer,
  stopServer,
  getStatus,
  setAccounts,
  protocolHandlers
};
