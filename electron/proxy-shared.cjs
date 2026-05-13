/**
 * proxy-shared.cjs — 共享接口定义
 * 
 * 所有 proxy 子模块通过此文件约定的接口通信。
 * 避免循环依赖，每个子模块职责单一。
 * 
 * 接口约定:
 *   proxy-session.cjs  →  export: { getSession(accountId), releaseSession(accountId), ... }
 *   proxy-router.cjs   →  export: { forwardRequest(account, request, protocol) }
 *   proxy-openai.cjs   →  export: { handleChatCompletion(req, res, account) }
 *   proxy-anthropic.cjs → export: { handleMessages(req, res, account) }
 *   model-mapper.cjs   →  export: { mapModel(name, from, to), listModels(protocol) }
 *   proxy-api-discovery.cjs → export: { discoverApiFormat(account), getCachedApiFormat(accountId) }
 */

// ─── 账号结构约定 (account 对象的最小字段) ───
// {
//   id: string;                          // 账号唯一标识
//   providerId: string;                  // 如 'kiro'
//   email: string;
//   username: string;
//   webProfilePath: string;              // Playwright persistent context 路径
//   storageStatePath: string;            // Playwright storageState JSON 路径
//   ssoCookieName: string;              // 如 'x-amz-sso_authn'
//   ssoTokenPreview: string;            // Cookie 值预览
//   availableModels: string[];           // 可用模型列表 (Kiro 格式名)
//   discoveredApis: Array<{             // 已发现的 API 端点
//     url: string;
//     method: string;
//     status: number;
//   }>;
//   proxyConfig?: {                      // 出站代理配置 (可选)
//     enabled: boolean;
//     server: string;
//     port: number;
//     protocol: string;
//     username?: string;
//     password?: string;
//   };
// }

// ─── API 发现结果 ───
// {
//   chatEndpoint: string;               // Chat API URL (如 'https://api.kiro.dev/v1/chat')
//   method: string;                     // 'POST'
//   headers: Record<string, string>;    // 需要的请求头 (Cookie, 等)
//   requestBodyTemplate: object;        // 请求体结构模板
//   responseMapping: {                  // 响应字段映射
//     content: string;                  // 从 JSON 中提取文本的路径
//     model: string;                    // 模型名路径
//     usage: { prompt_tokens, completion_tokens, total_tokens } 路径
//   };
//   canDirectHttp: boolean;            // 是否支持直接 HTTP 调用 (vs 需要 Playwright)
// }

// ─── 代理配置 ───
const DEFAULT_CONFIG = {
  host: process.env.PROXY_HOST || '127.0.0.1',
  port: parseInt(process.env.PROXY_PORT || '11434', 10),
  requestTimeout: parseInt(process.env.PROXY_TIMEOUT || '120000', 10),
  maxConcurrentPerAccount: 5,
  sessionPoolSize: 10,
  autoDiscoverApi: true,               // 首次使用时自动发现 API 格式
  fallbackToWeb: true                  // 直接 HTTP 失败时回退到浏览器模式
};

/**
 * 根据 account 对象获取 profile 目录路径
 * 此函数由 main.cjs 提供注入，避免 proxy 直接依赖 app.getPath
 */
let _profilePathResolver = null;
function setProfilePathResolver(fn) {
  _profilePathResolver = fn;
}
function getProfilePath(accountId) {
  if (!_profilePathResolver) throw new Error('profile path resolver not set');
  return _profilePathResolver(accountId);
}

module.exports = {
  DEFAULT_CONFIG,
  setProfilePathResolver,
  getProfilePath
};
