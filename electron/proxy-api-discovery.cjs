/**
 * proxy-api-discovery.cjs — Kiro API 自动发现模块
 *
 * 自动发现 Kiro Chat Completion API 格式并缓存结果。
 * 用于 proxy-router.cjs 在首次转发请求前了解目标 API 的请求/响应结构。
 *
 * 与现有 isInterestingKiroApi() 的关键区别:
 *   isInterestingKiroApi() 仅匹配 usage/quota/billing 等管理端点
 *   本模块的 isChatApi() 额外匹配 chat/completion/conversation 等对话端点
 */

const { chromium } = require('playwright');

// ─── 域名模式 (与 isInterestingKiroApi 保持一致) ───
const DOMAIN_PATTERN = /kiro|amazonaws|awsapps|builder/i;

// ─── 聊天 API 路径模式 ───
const CHAT_PATH_PATTERN = /\/chat|\/completion|\/completions|\/conversation|\/message|\/generate|\/v1\//i;

// ─── 非聊天 API 排除模式 (防止 /v1/ 误匹配 usage/quota 等管理端点) ───
const NON_CHAT_EXCLUDE = /\/(?:usage|quota|credit|billing|subscription|entitlement|profile|account)(?:\/|$)/i;

// ─── 默认 TTL (毫秒) ───
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 小时
let cacheTtlMs = DEFAULT_CACHE_TTL_MS;

// ─── 内存缓存 ───
const formatCache = new Map(); // accountId → { format, timestamp }

// ─── 默认模型列表 (Kiro) ───
const DEFAULT_KIRO_MODELS = [
  'claude-sonnet-4-5-20250929-v1',
  'claude-3-5-sonnet-20241022-v1',
  'claude-3-opus-20240229-v1',
  'claude-3-5-haiku-20241022-v1'
];

// ============================================================================
// 公开 API
// ============================================================================

/**
 * 判断 URL 是否可能是聊天/对话 API 端点
 * 匹配域名 + 路径双重条件
 *
 * @param {string} url
 * @returns {boolean}
 */
function isChatApi(url) {
  return DOMAIN_PATTERN.test(url)
    && CHAT_PATH_PATTERN.test(url)
    && !NON_CHAT_EXCLUDE.test(url);
}

/**
 * 自动发现 Kiro Chat Completion API 格式
 * 使用 Playwright 打开已登录的浏览器上下文，拦截 API 响应并提取格式
 *
 * @param {object} account - 账号对象 (必须有 id, webProfilePath)
 * @param {object} [options]
 * @param {number} [options.timeoutMs=30000] - 最大等待时间
 * @param {boolean} [options.attemptChatTrigger=true] - 是否尝试触发一次聊天以获取请求体
 * @returns {Promise<object>} 发现的 API 格式对象
 */
async function discoverApiFormat(account, options = {}) {
  const timeoutMs = options.timeoutMs || 30000;
  const attemptChatTrigger = options.attemptChatTrigger !== false;

  if (!account || !account.id || !account.webProfilePath) {
    throw new Error('discoverApiFormat: account 必须有 id 和 webProfilePath');
  }

  const collectedResponses = []; // { url, method, status, headers, requestBody, responseBody }
  const discoveredHeaders = {};
  const startTime = Date.now();

  // ── 构建浏览器上下文选项 ──
  const contextOptions = {
    headless: true,
    viewport: { width: 1280, height: 820 }
  };

  // 应用代理配置 (如果账号有出站代理)
  const proxyConfig = account.proxyConfig;
  if (proxyConfig && proxyConfig.enabled) {
    const { server, port, protocol, username, password } = proxyConfig;
    const proxyServer = `${protocol || 'http'}://${server}:${port}`;
    contextOptions.proxy = { server: proxyServer };
    if (username && password) {
      contextOptions.proxy.username = username;
      contextOptions.proxy.password = password;
    }
  }

  /** @type {import('playwright').BrowserContext} */
  let context = null;

  try {
    // ── 启动持久化上下文 (复用已登录的 Profile) ──
    context = await chromium.launchPersistentContext(account.webProfilePath, contextOptions);

    // ── 监听新页面: 为每个页面注册响应拦截 ──
    context.on('page', (page) => {
      page.on('response', handleResponse);
    });

    // 为已存在的页面也注册 (通常 launchPersistentContext 后会有一个初始页面)
    for (const page of context.pages()) {
      page.on('response', handleResponse);
    }

    let mainPage = context.pages()[0] || await context.newPage();

    // ── 导航到 Kiro 应用 ──
    await mainPage.goto('https://app.kiro.dev', {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(timeoutMs, 45000)
    }).catch(() => {
      // 导航失败不阻塞 — 可能已登录或网络问题
    });

    // ── 等待页面稳定，让自然发生的 API 调用完成 ──
    await waitForStable(mainPage, Math.min(timeoutMs, 15000));

    // ── 如果没有捕获到聊天 API，尝试触发一次 ──
    const chatResponses = collectedResponses.filter((r) => isChatApi(r.url));
    if (attemptChatTrigger && chatResponses.length === 0 && Date.now() - startTime < timeoutMs) {
      try {
        await triggerChatInteraction(mainPage, timeoutMs - (Date.now() - startTime));
        // 等待响应到达
        await waitForStable(mainPage, Math.min(timeoutMs - (Date.now() - startTime), 8000));
      } catch (_) {
        // 触发失败不阻塞 — 可能页面结构与预期不符
      }
    }

    // ── 从捕获的响应中提取 API 格式 ──
    const allChatResponses = collectedResponses.filter((r) => isChatApi(r.url));
    const bestResponse = selectBestChatResponse(allChatResponses);

    // ── 从响应中提取请求头 ──
    if (bestResponse) {
      if (bestResponse.headers['authorization']) {
        discoveredHeaders['Authorization'] = bestResponse.headers['authorization'];
      }
      if (bestResponse.headers['cookie']) {
        discoveredHeaders['Cookie'] = bestResponse.headers['cookie'];
      }
      if (bestResponse.headers['content-type']) {
        discoveredHeaders['Content-Type'] = bestResponse.headers['content-type'];
      } else {
        discoveredHeaders['Content-Type'] = 'application/json';
      }
    }

    // ── 构建请求模板 ──
    const requestTemplate = buildRequestTemplate(bestResponse);

    // ── 构建响应格式 ──
    const responseFormat = buildResponseFormat(bestResponse);

    // ── 判断是否 OpenAI 兼容 ──
    const isOpenAICompatible = checkOpenAICompatibility(bestResponse);

    const format = {
      chatEndpoint: bestResponse ? bestResponse.url : 'https://api.kiro.dev/v1/chat/completions',
      method: (bestResponse && bestResponse.method) || 'POST',
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        discoveredHeaders
      ),
      requestTemplate,
      responseFormat,
      discoveredAt: new Date().toISOString(),
      isOpenAICompatible
    };

    // ── 缓存结果 ──
    formatCache.set(account.id, { format, timestamp: Date.now() });

    return format;
  } finally {
    // ── 确保清理 ──
    if (context) {
      try { await context.close(); } catch (_) {}
    }
  }

  // ── 内部函数: 处理每个响应 ──
  async function handleResponse(response) {
    try {
      const url = response.url();
      const status = response.status();

      // 只处理 JSON 响应
      const contentType = (response.headers()['content-type'] || '').toLowerCase();
      if (!contentType.includes('json')) return;

      // 只处理成功响应
      if (status < 200 || status >= 300) return;

      // 只处理聊天 API
      if (!isChatApi(url)) return;

      const request = response.request();
      const method = request.method();
      const reqHeaders = request.headers();

      let requestBody = null;
      if (method === 'POST') {
        try {
          const postData = request.postData();
          if (postData) {
            requestBody = JSON.parse(postData);
          }
        } catch (_) {}
      }

      let responseBody = null;
      try {
        responseBody = await response.json();
      } catch (_) {}

      // 去重
      if (!collectedResponses.some((r) => r.url === url && r.method === method)) {
        collectedResponses.push({
          url,
          method,
          status,
          headers: reqHeaders,
          requestBody,
          responseBody
        });
      }
    } catch (_) {
      // 跳过解析失败
    }
  }
}

/**
 * 获取缓存的 API 格式
 *
 * @param {string} accountId
 * @returns {object|null} 缓存的格式对象，过期或不存在时返回 null
 */
function getCachedApiFormat(accountId) {
  const entry = formatCache.get(accountId);
  if (!entry) return null;

  if (Date.now() - entry.timestamp > cacheTtlMs) {
    formatCache.delete(accountId);
    return null;
  }

  return entry.format;
}

/**
 * 清除缓存
 *
 * @param {string} accountId - 账号 ID，'*' 清除所有
 */
function clearCache(accountId) {
  if (accountId === '*') {
    formatCache.clear();
    return;
  }
  formatCache.delete(accountId);
}

/**
 * 获取缓存统计
 *
 * @returns {{ size: number, keys: string[], ttlMs: number }}
 */
function getCacheStats() {
  return {
    size: formatCache.size,
    keys: Array.from(formatCache.keys()),
    ttlMs: cacheTtlMs
  };
}

/**
 * 设置缓存 TTL
 * @param {number} ms
 */
function setCacheTtl(ms) {
  cacheTtlMs = ms;
}

// ============================================================================
// 内部辅助函数
// ============================================================================

/**
 * 等待页面网络空闲
 */
async function waitForStable(page, maxMs) {
  const remaining = maxMs - 500;
  if (remaining <= 0) return;
  try {
    await page.waitForLoadState('networkidle', { timeout: remaining }).catch(() => {});
  } catch (_) {}
  // 额外等待一小段时间让异步响应完成
  await page.waitForTimeout(Math.min(2000, Math.max(500, remaining))).catch(() => {});
}

/**
 * 尝试在 Kiro Chat UI 中触发一次聊天交互
 * 发送一条简单消息以触发 Chat Completion API 调用
 */
async function triggerChatInteraction(page, timeoutMs) {
  if (timeoutMs <= 0) return;

  // 多种可能的聊天输入选择器
  const chatInputSelectors = [
    'textarea[placeholder*="essage"]',
    'textarea[placeholder*="chat"]',
    'textarea[placeholder*="输入"]',
    'textarea[placeholder*="Type"]',
    'textarea[placeholder*="Ask"]',
    '[contenteditable="true"]',
    'div[role="textbox"]',
    'textarea'
  ];

  for (const selector of chatInputSelectors) {
    try {
      const input = await page.waitForSelector(selector, {
        state: 'visible',
        timeout: Math.min(timeoutMs, 8000)
      });
      if (input) {
        await input.click();
        await input.fill('Hello');
        await page.waitForTimeout(500);

        // 尝试多种发送方式
        const sendSelectors = [
          'button[type="submit"]',
          'button:has-text("Send")',
          'button:has-text("send")',
          'button:has-text("发送")',
          '[aria-label="Send"]',
          '[aria-label="send"]'
        ];

        let sent = false;
        for (const sendSelector of sendSelectors) {
          try {
            const sendBtn = await page.$(sendSelector);
            if (sendBtn) {
              await sendBtn.click();
              sent = true;
              break;
            }
          } catch (_) {}
        }

        // 如果没找到发送按钮，尝试按 Enter
        if (!sent) {
          await input.press('Enter');
        }

        return;
      }
    } catch (_) {
      // 选择器未找到，尝试下一个
    }
  }
}

/**
 * 从捕获的聊天响应中选择最佳的 (优先选择 POST 且有响应体的)
 */
function selectBestChatResponse(responses) {
  if (responses.length === 0) return null;

  // 优先选择 POST 且有 messages/choices 的响应
  for (const r of responses) {
    if (r.method === 'POST' && r.responseBody && r.requestBody) {
      return r;
    }
  }

  // 其次选择 POST
  for (const r of responses) {
    if (r.method === 'POST' && r.responseBody) {
      return r;
    }
  }

  // 再其次选择有响应体的 GET
  for (const r of responses) {
    if (r.responseBody) {
      return r;
    }
  }

  // 最后返回第一个
  return responses[0];
}

/**
 * 根据捕获的响应构建请求体模板
 */
function buildRequestTemplate(bestResponse) {
  const template = {
    model: 'MODEL_PLACEHOLDER',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'USER_MESSAGE_PLACEHOLDER' }
    ],
    stream: false
  };

  if (bestResponse && bestResponse.requestBody) {
    const body = bestResponse.requestBody;

    // 复制 model 字段
    if (body.model) {
      template.model = body.model;
    }

    // 复制 messages 结构
    if (body.messages && Array.isArray(body.messages)) {
      template.messages = body.messages;
    }

    // 复制其他常见字段 (保留原有值)
    if (body.stream !== undefined) template.stream = body.stream;
    if (body.temperature !== undefined) template.temperature = body.temperature;
    if (body.max_tokens !== undefined) template.max_tokens = body.max_tokens;
    if (body.top_p !== undefined) template.top_p = body.top_p;
    if (body.frequency_penalty !== undefined) template.frequency_penalty = body.frequency_penalty;
    if (body.presence_penalty !== undefined) template.presence_penalty = body.presence_penalty;
    if (body.stop !== undefined) template.stop = body.stop;

    // 复制 Kiro 特有的字段
    if (body.parameters !== undefined) template.parameters = body.parameters;
    if (body.options !== undefined) template.options = body.options;
  }

  return template;
}

/**
 * 根据捕获的响应构建响应格式映射
 */
function buildResponseFormat(bestResponse) {
  const format = {
    contentPath: null,
    modelPath: null,
    usagePath: null,
    finishReasonPath: null
  };

  if (bestResponse && bestResponse.responseBody) {
    const body = bestResponse.responseBody;

    // 检测 choices 结构 (OpenAI 兼容)
    if (body.choices && Array.isArray(body.choices) && body.choices[0]) {
      const choice = body.choices[0];

      if (choice.message && choice.message.content !== undefined) {
        format.contentPath = 'choices[0].message.content';
      } else if (choice.text !== undefined) {
        format.contentPath = 'choices[0].text';
      } else if (choice.content !== undefined) {
        format.contentPath = 'choices[0].content';
      }

      if (choice.finish_reason !== undefined) {
        format.finishReasonPath = 'choices[0].finish_reason';
      }
    }

    // 检测其他常见格式
    if (!format.contentPath) {
      if (body.content !== undefined) {
        format.contentPath = 'content';
      } else if (body.text !== undefined) {
        format.contentPath = 'text';
      } else if (body.response !== undefined) {
        format.contentPath = 'response';
      } else if (body.message && body.message.content !== undefined) {
        format.contentPath = 'message.content';
      }
    }

    // 检测 model 字段
    if (body.model !== undefined) {
      format.modelPath = 'model';
    }

    // 检测 usage 字段
    if (body.usage && typeof body.usage === 'object') {
      format.usagePath = 'usage';
    } else if (body.usage !== undefined) {
      format.usagePath = 'usage';
    }
  }

  // 默认使用 OpenAI 兼容路径
  if (!format.contentPath) format.contentPath = 'choices[0].message.content';
  if (!format.modelPath) format.modelPath = 'model';
  if (!format.usagePath) format.usagePath = 'usage';
  if (!format.finishReasonPath) format.finishReasonPath = 'choices[0].finish_reason';

  return format;
}

/**
 * 检查响应格式是否与 OpenAI 兼容
 * 关键特征: 顶层有 choices 数组，choices[0] 有 message.content
 */
function checkOpenAICompatibility(bestResponse) {
  if (!bestResponse || !bestResponse.responseBody) return false;

  const body = bestResponse.responseBody;

  // 必须有 choices 数组
  if (!body.choices || !Array.isArray(body.choices) || body.choices.length === 0) {
    return false;
  }

  const choice = body.choices[0];
  if (!choice || typeof choice !== 'object') return false;

  // 必须有 message 对象或 content 字段
  if (choice.message && typeof choice.message === 'object') {
    return choice.message.content !== undefined || choice.message.content === null;
  }

  if (choice.delta && typeof choice.delta === 'object') {
    return choice.delta.content !== undefined;
  }

  return choice.content !== undefined || choice.text !== undefined;
}

// ============================================================================
// 模块导出
// ============================================================================

module.exports = {
  // 核心公开 API
  discoverApiFormat,
  getCachedApiFormat,
  clearCache,
  isChatApi,
  getCacheStats,

  // 配置
  setCacheTtl,
  DEFAULT_CACHE_TTL_MS,

  // 常量
  DEFAULT_KIRO_MODELS
};
