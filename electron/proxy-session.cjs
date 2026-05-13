/**
 * proxy-session.cjs — Playwright 会话管理池
 * 
 * 管理 Chromium PersistentContext 实例，提供 lazy 初始化、
 * LRU 淘汰、并发控制和健康检查。
 * 
 * 接口:
 *   getSession(accountId)          — 获取或创建会话
 *   releaseSession(accountId)      — 释放会话并发槽位
 *   withSession(accountId, fn)     — 获取会话 → 执行回调 → 自动释放
 *   shutdown()                     — 关闭所有会话
 */

const path = require('path');
const fs = require('fs/promises');

let chromium = null;
function getChromium() {
  if (!chromium) {
    chromium = require('playwright').chromium;
  }
  return chromium;
}

// ─── 会话池 ───
const MAX_POOL_SIZE = 10;
const MAX_CONCURRENT_PER_ACCOUNT = 5;

/** @type {Map<string, { context: object, page: object, lastUsed: number, activeRequests: number, queue: Array<{ resolve: Function, reject: Function }>, account: object }>} */
const sessions = new Map();

// ─── 辅助函数 ───
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_err) {
    return false;
  }
}

function evictLRU() {
  if (sessions.size < MAX_POOL_SIZE) return;

  let oldestKey = null;
  let oldestTime = Infinity;

  for (const [key, session] of sessions) {
    // 只能淘汰没有活跃请求的会话
    if (session.activeRequests === 0 && session.lastUsed < oldestTime) {
      oldestTime = session.lastUsed;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    const session = sessions.get(oldestKey);
    console.log(`[proxy-session] Evicting LRU session: ${oldestKey}`);
    sessions.delete(oldestKey);
    // 异步关闭，不阻塞
    session.context.close().catch((err) => {
      console.error(`[proxy-session] Error closing evicted session ${oldestKey}:`, err.message);
    });
  }
}

function touchSession(accountId) {
  const session = sessions.get(accountId);
  if (session) {
    session.lastUsed = Date.now();
  }
}

// ─── 构建浏览器启动选项 ───
function buildContextOptions(account) {
  const options = {
    headless: true,
    viewport: { width: 1280, height: 820 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  };

  // 应用代理配置
  const proxyConfig = account?.proxyConfig;
  if (proxyConfig && proxyConfig.enabled) {
    const { server, port, protocol, username, password } = proxyConfig;
    const proxyServer = `${protocol || 'http'}://${server}:${port}`;

    options.proxy = { server: proxyServer };
    if (username && password) {
      options.proxy.username = username;
      options.proxy.password = password;
    }

    console.log(`[proxy-session] Proxy enabled for account ${account?.id}: ${protocol || 'http'}://${server}:${port}`);
  }

  // 如果有 storage state 文件，预加载
  const storageStatePath = account?.storageStatePath;
  if (storageStatePath) {
    // 路径会在创建 context 时检查，这里只是记录
    options._storageStatePath = storageStatePath;
  }

  return options;
}

// ─── 健康检查与恢复 ───
async function ensureSessionHealthy(session) {
  if (!session.context) return;

  try {
    // 获取或创建 page
    const pages = session.context.pages();
    if (pages.length === 0) {
      session.page = await session.context.newPage();
    } else {
      session.page = pages[0];
    }

    // 检查 page 是否已关闭
    if (session.page && typeof session.page.isClosed === 'function') {
      try {
        if (session.page.isClosed()) {
          console.log('[proxy-session] Page closed, creating new page');
          session.page = await session.context.newPage();
        }
      } catch (_err) {
        session.page = await session.context.newPage();
      }
    }
  } catch (err) {
    console.error(`[proxy-session] Health check failed for ${session.account?.id}:`, err.message);
    // 标记为需要重建
    session.needsRebuild = true;
  }
}

// ─── 创建新会话 ───
async function createSession(account) {
  const accountId = account.id || 'unknown';
  const profilePath = account.webProfilePath;

  if (!profilePath) {
    throw new Error(`Account ${accountId} has no webProfilePath`);
  }

  console.log(`[proxy-session] Creating session for account ${accountId}, profile: ${profilePath}`);

  // 确保 profile 目录存在
  await fs.mkdir(path.dirname(profilePath), { recursive: true });

  const contextOptions = buildContextOptions(account);

  // 如果有 storage state 文件且存在，加载它
  const storageStatePath = contextOptions._storageStatePath;
  delete contextOptions._storageStatePath;

  let storageState = null;
  if (storageStatePath && await pathExists(storageStatePath)) {
    try {
      const raw = await fs.readFile(storageStatePath, 'utf8');
      storageState = JSON.parse(raw);
      console.log(`[proxy-session] Loaded storage state for ${accountId}`);
    } catch (err) {
      console.warn(`[proxy-session] Failed to load storage state for ${accountId}:`, err.message);
    }
  }

  const chromiumInstance = getChromium();
  const context = await chromiumInstance.launchPersistentContext(profilePath, contextOptions);
  let page = context.pages()[0] || await context.newPage();

  // 如果已经有 storageState，apply 额外的 cookies/storage
  if (storageState) {
    try {
      if (storageState.cookies && Array.isArray(storageState.cookies)) {
        await context.addCookies(storageState.cookies);
      }
      // 如果有 origins 数据，尝试通过 page 加载
      if (storageState.origins && Array.isArray(storageState.origins)) {
        for (const origin of storageState.origins) {
          await page.goto(origin.origin, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn(`[proxy-session] Failed to restore storage state for ${accountId}:`, err.message);
    }
  }

  const session = {
    context,
    page,
    lastUsed: Date.now(),
    activeRequests: 0,
    queue: [],
    account,
    needsRebuild: false
  };

  return session;
}

// ─── 发布 API ───

/**
 * 获取指定账号的会话。
 * 如果会话不存在，懒初始化创建。
 * 如果已达 5 个并发上限，请求进入队列等待。
 */
function getSession(accountId) {
  return new Promise((resolve, reject) => {
    const existing = sessions.get(accountId);

    if (existing && existing.activeRequests < MAX_CONCURRENT_PER_ACCOUNT) {
      existing.activeRequests++;
      touchSession(accountId);

      ensureSessionHealthy(existing).then(() => {
        if (existing.needsRebuild) {
          existing.needsRebuild = false;
          rebuildSession(accountId, existing).then(resolve, reject);
        } else {
          resolve(existing);
        }
      }).catch((err) => {
        existing.activeRequests--;
        reject(err);
      });

      return;
    }

    // 需要等待（已有会话但并发满，或无会话）
    const queueEntry = { resolve, reject };
    if (existing) {
      existing.queue.push(queueEntry);
    } else {
      // 无会话，创建并设置队列
      const placeholder = {
        context: null,
        page: null,
        lastUsed: Date.now(),
        activeRequests: 1,
        queue: [queueEntry],
        account: { id: accountId },
        needsRebuild: false
      };
      sessions.set(accountId, placeholder);
      evictLRU();

      createSessionForAccount(accountId, placeholder).catch((err) => {
        placeholder.activeRequests--;
        reject(err);
        // 处理队列中的其他请求
        while (placeholder.queue.length > 0) {
          const entry = placeholder.queue.shift();
          if (entry) entry.reject(err);
        }
        sessions.delete(accountId);
      });
    }
  });
}

async function createSessionForAccount(accountId, placeholder) {
  const account = placeholder.account;
  const session = await createSession(account);
  // 将新会话的数据复制到 placeholder
  Object.assign(placeholder, session);
  placeholder.lastUsed = Date.now();

  // 处理队列中的第一个等待者
  if (placeholder.queue.length > 0) {
    const entry = placeholder.queue.shift();
    if (entry) entry.resolve(placeholder);
  }
}

async function rebuildSession(accountId, oldSession) {
  console.log(`[proxy-session] Rebuilding session for ${accountId}`);
  const account = oldSession.account;
  try {
    await oldSession.context.close().catch(() => {});
  } catch (_err) {}
  const newSession = await createSession(account);
  Object.assign(oldSession, newSession);
  oldSession.lastUsed = Date.now();
  return oldSession;
}

/**
 * 释放会话的并发槽位。
 * 如果有排队请求，处理队列中的下一个。
 */
function releaseSession(accountId) {
  const session = sessions.get(accountId);
  if (!session) return;

  session.activeRequests = Math.max(0, session.activeRequests - 1);
  touchSession(accountId);

  // 处理队列
  if (session.queue.length > 0 && session.activeRequests < MAX_CONCURRENT_PER_ACCOUNT) {
    const entry = session.queue.shift();
    if (entry) {
      session.activeRequests++;
      ensureSessionHealthy(session).then(() => {
        if (session.needsRebuild) {
          session.needsRebuild = false;
          rebuildSession(accountId, session).then(entry.resolve, entry.reject);
        } else {
          entry.resolve(session);
        }
      }).catch((err) => {
        session.activeRequests--;
        entry.reject(err);
      });
    }
  }
}

/**
 * 在会话上下文中执行回调，自动获取和释放会话。
 */
async function withSession(accountId, callback) {
  const session = await getSession(accountId);
  try {
    return await callback(session);
  } finally {
    releaseSession(accountId);
  }
}

/**
 * 关闭所有会话并清空池。
 */
async function shutdown() {
  console.log('[proxy-session] Shutting down all sessions...');
  const closePromises = [];

  for (const [accountId, session] of sessions) {
    if (session.context) {
      closePromises.push(
        session.context.close().catch((err) => {
          console.error(`[proxy-session] Error closing session ${accountId}:`, err.message);
        })
      );
    }
  }

  sessions.clear();
  await Promise.allSettled(closePromises);
  console.log('[proxy-session] All sessions closed');
}

module.exports = {
  getSession,
  releaseSession,
  withSession,
  shutdown,
  // 导出用于调试
  getPoolSize: () => sessions.size,
  getActiveRequests: (accountId) => {
    const session = sessions.get(accountId);
    return session ? session.activeRequests : 0;
  }
};
