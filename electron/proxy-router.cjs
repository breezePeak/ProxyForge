/**
 * proxy-router.cjs — 账号路由与请求转发
 * 
 * 负责:
 *  1. 账号选择（X-Account-Id 头 → 精确匹配，否则 → 轮询）
 *  2. 将通过 Playwright 会话将 AI API 请求转发到 Kiro 平台
 *  3. API 格式发现与缓存（委托给 proxy-api-discovery.cjs）
 * 
 * 接口:
 *   resolveAccount(request, accounts)  — 选择目标账号
 *   forwardToKiro(account, requestBody, session, apiFormat) — 转发请求
 *   setApiDiscovery(module)            — 注入 API 发现模块
 */

const { getSession, releaseSession } = require('./proxy-session.cjs');

// ─── API 发现模块（延迟注入） ───
let apiDiscovery = null;

try {
  apiDiscovery = require('./proxy-api-discovery.cjs');
} catch (err) {
  if (err.code !== 'MODULE_NOT_FOUND') {
    console.error('[proxy-router] Failed to load proxy-api-discovery.cjs:', err.message);
  }
  // 允许缺失，首次使用时自动兜底
}

// ─── 轮询状态 ───
let roundRobinIndex = 0;

// ─── 常量 ───
const DEFAULT_TIMEOUT_MS = 120000;
const KIRO_CHAT_URL = 'https://app.kiro.dev';
const KIRO_CHAT_WAIT_TIMEOUT = 30000;

// ─── 公共 API ───

/**
 * 设置 API 发现模块（外部注入，避免循环依赖）
 */
function setApiDiscovery(module) {
  apiDiscovery = module;
}

/**
 * 从请求中解析目标账号。
 *
 * 选择逻辑:
 *   1. X-Account-Id 头 → 精确匹配 account.id
 *   2. 无头 → 轮询所有活跃 provider 的账号
 *   3. 跳过 availableModels 为空、provider 禁用反代、或账号禁用反代的账号
 *
 * @param {http.IncomingMessage} request - HTTP 请求对象
 * @param {Array<object>} accounts - 账号列表
 * @param {Array<object>} providers - provider 列表（可选，用于 provider 级过滤）
 * @returns {object|null} 选中的账号，无法匹配时返回 null
 */
function resolveAccount(request, accounts, providers) {
  const headerAccountId = (request.headers['x-account-id'] || '').trim();
  const validAccounts = filterValidAccounts(accounts, providers);

  if (validAccounts.length === 0) {
    return null;
  }

  // 1. 精确匹配 X-Account-Id
  if (headerAccountId) {
    const matched = validAccounts.find(
      (a) => a.id === headerAccountId || String(a.id) === String(headerAccountId)
    );
    if (matched) {
      console.log(`[proxy-router] Matched account by X-Account-Id: ${matched.id}`);
      return matched;
    }
    // 指定了 ID 但没找到有效账号
    console.warn(`[proxy-router] Account ${headerAccountId} not found in valid accounts`);
    return null;
  }

  // 2. 轮询选择
  const chosen = roundRobinSelect(validAccounts);
  if (chosen) {
    console.log(`[proxy-router] Round-robin selected account: ${chosen.id} (index=${roundRobinIndex - 1})`);
  }
  return chosen;
}

/**
 * 过滤有效账号：
 *   - provider 的 proxyEnabled !== false（provider 级开关，默认 true）
 *   - availableModels 非空
 *   - 账号未单独禁用反代（apiProxyDisabled !== true）
 */
function filterValidAccounts(accounts, providers) {
  if (!Array.isArray(accounts)) return [];

  // 构建 provider 禁用集合
  const disabledProviderIds = new Set();
  if (Array.isArray(providers)) {
    providers.forEach((p) => {
      if (p.proxyEnabled === false) {
        disabledProviderIds.add(p.id);
      }
    });
  }

  return accounts.filter((account) => {
    // 必须有 id 和 providerId
    if (!account.id || !account.providerId) return false;

    // provider 级开关检查：provider proxyEnabled === false 则整个 provider 禁用
    if (disabledProviderIds.has(account.providerId)) {
      console.log(`[proxy-router] Skipping account ${account.id}: provider ${account.providerId} proxy disabled`);
      return false;
    }

    // availableModels 必须非空
    if (!account.availableModels || account.availableModels.length === 0) {
      console.log(`[proxy-router] Skipping account ${account.id}: no availableModels`);
      return false;
    }

    // 账号级开关检查：默认允许，apiProxyDisabled === true 才禁用
    if (account.apiProxyDisabled === true) {
      console.log(`[proxy-router] Skipping account ${account.id}: apiProxyDisabled`);
      return false;
    }

    return true;
  });
}

/**
 * 轮询选择：递增 roundRobinIndex，取模后返回对应账号。
 */
function roundRobinSelect(accounts) {
  if (accounts.length === 0) return null;
  roundRobinIndex = (roundRobinIndex % accounts.length);
  const chosen = accounts[roundRobinIndex];
  roundRobinIndex++;
  return chosen;
}

/**
 * 将 AI API 请求转发到 Kiro 平台。
 * 
 * 流程:
 *   1. 确保会话有效（通过 proxy-session 获取/创建）
 *   2. 导航到 Kiro chat 页面（确保认证 Cookie 生效）
 *   3. 发现或使用已知的 API 格式
 *   4. 通过 page.evaluate() 调用 Kiro 内部 API
 *   5. 提取并返回响应内容
 * 
 * @param {object} account - 账号对象
 * @param {object} requestBody - 解析后的请求体（AI API 格式）
 * @param {object} session - 从 proxy-session 获取的会话对象（可选；不传则自动获取）
 * @param {object|null} apiFormat - 已知的 Kiro API 格式（跳过发现步骤）
 * @returns {Promise<{content: string, model: string, usage: object, raw: object}>}
 */
async function forwardToKiro(account, requestBody, session, apiFormat) {
  const accountId = account.id;
  let ownSession = false;

  try {
    // 1. 获取或使用传入的会话
    if (!session) {
      session = await getSession(accountId);
      ownSession = true;
    }

    const page = session.page;

    // 2. 确保在 Kiro 页面上（带超时）
    const currentUrl = page.url();
    const isOnKiro = currentUrl.includes('kiro.dev') || currentUrl.includes('awsapps.com');

    if (!isOnKiro) {
      console.log(`[proxy-router] Navigating to Kiro chat page for account ${accountId}`);
      try {
        await page.goto(KIRO_CHAT_URL, {
          waitUntil: 'domcontentloaded',
          timeout: KIRO_CHAT_WAIT_TIMEOUT
        });
      } catch (navErr) {
        console.warn(`[proxy-router] Navigation to Kiro may have timed out, continuing: ${navErr.message}`);
      }

      // 等待页面基本可用
      try {
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      } catch (_err) {}
    }

    // 3. 发现或使用 API 格式
    let format = apiFormat;
    if (!format) {
      format = await getOrDiscoverApiFormat(account, page);
    }

    if (!format) {
      throw Object.assign(new Error('Failed to discover Kiro API format'), {
        type: 'api_discovery_failed',
        code: 'NO_API_FORMAT'
      });
    }

    // 4. 通过 page.evaluate() 调用 Kiro 内部 API
    const result = await callKiroInternalApi(page, requestBody, format);

    return result;

  } finally {
    if (ownSession) {
      releaseSession(accountId);
    }
  }
}

/**
 * 获取或发现 Kiro API 格式。
 * 优先使用已缓存的格式，否则通过 API 发现模块获取。
 */
async function getOrDiscoverApiFormat(account, page) {
  // 尝试从 discovery 模块获取缓存
  if (apiDiscovery && typeof apiDiscovery.getCachedApiFormat === 'function') {
    const cached = apiDiscovery.getCachedApiFormat(account.id);
    if (cached) {
      console.log(`[proxy-router] Using cached API format for ${account.id}`);
      return cached;
    }
  }

  // 尝试从 account.discoveredApis 构建格式
  if (account.discoveredApis && Array.isArray(account.discoveredApis)) {
    const chatApi = inferApiFormatFromDiscoveredApis(account.discoveredApis);
    if (chatApi) {
      console.log(`[proxy-router] Inferred API format from discoveredApis for ${account.id}`);
      return chatApi;
    }
  }

  // 自动发现
  if (apiDiscovery && typeof apiDiscovery.discoverApiFormat === 'function') {
    console.log(`[proxy-router] Auto-discovering API format for ${account.id}`);
    return await apiDiscovery.discoverApiFormat(account);
  }

  // 兜底：使用默认格式
  console.log(`[proxy-router] Using default Kiro API format for ${account.id}`);
  return getDefaultApiFormat();
}

/**
 * 从 discoveredApis 列表推断 API 格式。
 * 寻找匹配 /chat 或 /v1/chat 的端点。
 */
function inferApiFormatFromDiscoveredApis(discoveredApis) {
  const chatApis = discoveredApis.filter(
    (api) => api.method === 'POST' && /(chat|conversation|completion|message)/i.test(api.url)
  );

  if (chatApis.length === 0) return null;

  const best = chatApis[0];
  return {
    chatEndpoint: best.url,
    method: best.method,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    requestBodyTemplate: {},
    responseMapping: {
      content: 'content || message?.content || text || response',
      model: 'model || modelId',
      usage: {}
    },
    canDirectHttp: false
  };
}

/**
 * 默认的 Kiro API 格式（后备方案）。
 * 假设 Kiro 使用标准 chat 接口。
 */
function getDefaultApiFormat() {
  return {
    chatEndpoint: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    requestBodyTemplate: {},
    responseMapping: {
      content: 'content || message?.content || text || response',
      model: 'model || modelId',
      usage: {}
    },
    canDirectHttp: false
  };
}

/**
 * 通过 Playwright page.evaluate() 调用 Kiro 内部 API。
 * 
 * 由于 Kiro 是 SPA，内部 fetch 调用会自动携带认证 Cookie。
 * 这避免了提取 Cookie 和直接 HTTP 调用的复杂性。
 */
async function callKiroInternalApi(page, requestBody, format) {
  const { chatEndpoint, method, headers, requestBodyTemplate, responseMapping } = format;

  // 构建 Kiro 格式的请求体
  const kiroBody = buildKiroRequestBody(requestBody, requestBodyTemplate);

  // 构建完整的 API URL
  const apiUrl = chatEndpoint.startsWith('http')
    ? chatEndpoint
    : new URL(chatEndpoint, KIRO_CHAT_URL).toString();

  console.log(`[proxy-router] Calling Kiro API: ${method} ${apiUrl}`);

  // 在浏览器上下文中执行 fetch
  const result = await page.evaluate(async ({ apiUrl, method, headers, body, responseMapping, timeoutMs }) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const fetchOptions = {
        method: method || 'POST',
        headers: {
          ...headers,
          'Accept': headers['Accept'] || 'application/json'
        },
        body: JSON.stringify(body),
        credentials: 'include',
        signal: controller.signal
      };

      const response = await fetch(apiUrl, fetchOptions);

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text().catch(() => '');
        } catch (_e) {}
        throw new Error(`Kiro API responded with ${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson')) {
        // 流式响应：返回完整文本
        const text = await response.text();
        return {
          raw: { text, headers: Object.fromEntries(response.headers.entries()) },
          content: text,
          model: extractJsonField(text, responseMapping.model),
          usage: {},
          isStreaming: true
        };
      }

      const json = await response.json();

      // 提取内容
      let content = '';
      try {
        content = extractValueByPath(json, responseMapping.content);
      } catch (_e) {
        content = JSON.stringify(json);
      }

      // 提取模型名
      let model = '';
      try {
        model = extractValueByPath(json, responseMapping.model) || '';
      } catch (_e) {}

      // 提取用量
      let usage = {};
      if (responseMapping.usage) {
        try {
          usage.prompt_tokens = extractValueByPath(json, responseMapping.usage.prompt_tokens);
          usage.completion_tokens = extractValueByPath(json, responseMapping.usage.completion_tokens);
          usage.total_tokens = extractValueByPath(json, responseMapping.usage.total_tokens);
        } catch (_e) {}
      }

      return {
        raw: json,
        content,
        model,
        usage,
        isStreaming: false
      };

    } finally {
      clearTimeout(timeoutId);
    }
  }, {
    apiUrl,
    method,
    headers: format.headers || {},
    body: kiroBody,
    responseMapping,
    timeoutMs: DEFAULT_TIMEOUT_MS
  });

  return result;
}

/**
 * 将上游 AI API 请求体转换为 Kiro 内部格式。
 */
function buildKiroRequestBody(upstreamBody, template) {
  if (!template || Object.keys(template).length === 0) {
    // 无模板时原样传递关键字段
    return {
      messages: upstreamBody?.messages || [],
      model: upstreamBody?.model || '',
      stream: upstreamBody?.stream || false,
      max_tokens: upstreamBody?.max_tokens,
      temperature: upstreamBody?.temperature,
      top_p: upstreamBody?.top_p
    };
  }

  // 按模板映射
  const result = {};
  for (const [key, mapping] of Object.entries(template)) {
    result[key] = extractValueByPath(upstreamBody, mapping);
  }
  return result;
}

/**
 * 从对象中按路径提取值。
 * 路径格式: "a.b.c" 或 "a || b || c" (fallback)
 */
function extractValueByPath(obj, path) {
  if (!path || typeof path !== 'string') return undefined;

  // 处理 fallback 模式: "a || b.c || d"
  const alternatives = path.split('||').map((s) => s.trim());
  for (const alt of alternatives) {
    const value = resolvePath(obj, alt);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/**
 * 解析点号路径: "a.b.c" → obj.a.b.c
 */
function resolvePath(obj, dotPath) {
  if (!dotPath) return obj;
  const parts = dotPath.split('.').filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * 尝试从 JSON 字符串中提取字段值（用于 SSE 流式响应）。
 */
function extractJsonField(text, fieldPath) {
  if (!fieldPath) return '';
  try {
    // 尝试直接解析为 JSON
    const json = JSON.parse(text);
    return extractValueByPath(json, fieldPath) || '';
  } catch (_e) {
    // 对于流式文本，查找包含模型名的行
    const match = text.match(/["']?model["']?\s*:\s*["']([^"']+)["']/);
    return match ? match[1] : '';
  }
}

/**
 * 创建标准化的错误响应格式。
 */
function createErrorResponse(message, type, code) {
  return {
    error: {
      message: String(message),
      type: type || 'proxy_error',
      code: code || 'UNKNOWN'
    }
  };
}

module.exports = {
  resolveAccount,
  forwardToKiro,
  setApiDiscovery,
  createErrorResponse
};
