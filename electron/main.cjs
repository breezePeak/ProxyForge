const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs/promises');
const { FingerprintGenerator } = require('./fingerprint/generator.cjs');
const { FingerprintInjector } = require('./fingerprint/injector.cjs');
const { ConsistencyValidator } = require('./fingerprint/validator.cjs');
const { startServer: startProxyServer, stopServer: stopProxyServer, getStatus: getProxyStatus } = require('./proxy-server.cjs');
const { shutdown: shutdownProxySessions } = require('./proxy-session.cjs');
const { setProfilePathResolver } = require('./proxy-shared.cjs');

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const fingerprintGenerator = new FingerprintGenerator();
const fingerprintInjector = new FingerprintInjector();
const fingerprintValidator = new ConsistencyValidator();
let mainWindow = null;

const CODE_PATTERNS = [
  /(?:verification\s*code|验证码|Your code is|code is)[：:\s]*(\d{6})/gi,
  /(?:is|为)[：:\s]*(\d{6})\b/gi,
  /^\s*(\d{6})\s*$/gm,
  />\s*(\d{6})\s*</g
];

const PROVIDERS = [
  {
    id: 'mali215',
    name: '215.im (YYDS Mail)',
    requiresApiKey: true,
    envKeys: ['YYDS_MAIL_API_KEY', 'MALIAPI_215_API_KEY'],
    domains: ['0m0.abrdns.com', 'yyds.dev']
  },
  {
    id: 'tempmail_lol',
    name: 'tempmail.lol',
    requiresApiKey: false,
    domains: ['tempmail.lol']
  },
  {
    id: 'mail_tm',
    name: 'mail.tm',
    requiresApiKey: false,
    domains: ['mail.tm', '.tm']
  },
  {
    id: '1secmail',
    name: '1secmail.com',
    requiresApiKey: false,
    domains: ['1secmail.com', 'esiix.com', 'wwjmp.com', 'icznn.com']
  },
  {
    id: 'tempmail_plus',
    name: 'tempmail.plus',
    requiresApiKey: false,
    domains: ['tempmail.plus', 'tmpbox.net']
  },
  {
    id: 'guerrilla',
    name: 'guerrillamail.com',
    requiresApiKey: false,
    domains: ['guerrillamail.com', 'grr.la', 'sharklasers.com']
  }
];

const DEFAULT_KIRO_MODELS = [
  'Auto',
  'Claude Opus 4.7',
  'Claude Opus 4.6',
  'Claude Opus 4.5',
  'Claude Sonnet 4.6',
  'Claude Sonnet 4.5',
  'Claude Sonnet 4.0',
  'Claude Haiku 4.5',
  'DeepSeek 3.2',
  'MiniMax M2.5',
  'GLM-5',
  'MiniMax M2.1',
  'Qwen3 Coder Next'
];

function accountsFilePath() {
  return path.join(app.getPath('userData'), 'accounts.json');
}

function safePathSegment(value) {
  return String(value || 'default')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80) || 'default';
}

function kiroProfilesDir() {
  return path.join(app.getPath('userData'), 'kiro-profiles');
}

function kiroProfilePath(accountId) {
  return path.join(kiroProfilesDir(), safePathSegment(accountId));
}

function kiroWebSessionsDir() {
  return path.join(app.getPath('userData'), 'kiro-web-sessions');
}

function kiroWebProfilePath(accountId) {
  return path.join(kiroWebSessionsDir(), safePathSegment(accountId), 'profile');
}

function kiroStorageStatePath(accountId) {
  return path.join(kiroWebSessionsDir(), safePathSegment(accountId), 'storage-state.json');
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function resolveKiroExecutable(customPath) {
  const explicitPath = String(customPath || '').trim();
  if (explicitPath) {
    if (await pathExists(explicitPath)) return explicitPath;
    throw new Error(`Kiro 客户端路径不存在: ${explicitPath}`);
  }

  const candidates = [];
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.ProgramFiles || '';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || '';
    const userProfile = process.env.USERPROFILE || '';
    const homeDrive = process.env.HOMEDRIVE || 'C:';
    
    // 获取所有可能的用户目录盘符
    const userProfilesDir = path.join(homeDrive, 'Users');
    let userName = '';
    if (userProfile) {
      userName = path.basename(userProfile);
    }
    
    // 常见安装路径
    candidates.push(
      // 标准 LOCALAPPDATA 路径
      path.join(localAppData, 'Programs', 'Kiro', 'Kiro.exe'),
      path.join(localAppData, 'kiro', 'Kiro.exe'),
      // Program Files 路径
      path.join(programFiles, 'Kiro', 'Kiro.exe'),
      path.join(programFilesX86, 'Kiro', 'Kiro.exe'),
      // 当前用户目录（支持其他盘符）
      path.join(userProfile, 'AppData', 'Local', 'Programs', 'Kiro', 'Kiro.exe'),
      path.join(userProfile, 'AppData', 'Local', 'kiro', 'Kiro.exe')
    );
    
    // 尝试其他盘符的用户目录（D、E、F 等）
    const drives = ['D', 'E', 'F', 'G'];
    for (const drive of drives) {
      if (userName) {
        candidates.push(
          path.join(`${drive}:\\Users`, userName, 'AppData', 'Local', 'Programs', 'Kiro', 'Kiro.exe'),
          path.join(`${drive}:\\Users`, userName, 'AppData', 'Local', 'kiro', 'Kiro.exe')
        );
      }
      // 也检查直接路径
      candidates.push(
        path.join(`${drive}:\\Users`, 'Administrator', 'AppData', 'Local', 'Programs', 'Kiro', 'Kiro.exe'),
        path.join(`${drive}:\\Users`, 'Administrator', 'AppData', 'Local', 'kiro', 'Kiro.exe')
      );
    }
    
    // 尝试从 PATH 环境变量查找
    try {
      const { execSync } = require('child_process');
      const whereResult = execSync('where kiro 2>nul', { encoding: 'utf8', timeout: 5000 }).trim();
      if (whereResult) {
        const firstLine = whereResult.split('\n')[0].trim();
        if (firstLine && await pathExists(firstLine)) {
          // 如果找到的是 bin\kiro，尝试查找 Kiro.exe
          const dir = path.dirname(firstLine);
          const parentDir = path.dirname(dir);
          const exeInSameDir = path.join(dir, 'Kiro.exe');
          const exeInParentDir = path.join(parentDir, 'Kiro.exe');
          
          if (await pathExists(exeInSameDir)) candidates.push(exeInSameDir);
          if (await pathExists(exeInParentDir)) candidates.push(exeInParentDir);
          
          // 将 where 找到的路径也加入候选（作为后备）
          candidates.push(firstLine);
        }
      }
    } catch (_e) {}
    
    // 尝试从注册表读取安装路径
    try {
      const { execSync } = require('child_process');
      const regResult = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /f "Kiro" /k 2>nul',
        { encoding: 'utf8', timeout: 5000 }
      ).trim();
      if (regResult) {
        const keyMatch = regResult.match(/HKCU\\[^\s]+/);
        if (keyMatch) {
          const installLocation = execSync(
            `reg query "${keyMatch[0]}" /v "InstallLocation" 2>nul`,
            { encoding: 'utf8', timeout: 5000 }
          );
          const pathMatch = installLocation.match(/InstallLocation\s+REG_SZ\s+(.+)/);
          if (pathMatch) {
            const regPath = path.join(pathMatch[1].trim(), 'Kiro.exe');
            if (await pathExists(regPath)) return regPath;
          }
        }
      }
    } catch (_e) {}
    
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Kiro.app/Contents/MacOS/Kiro');
    // 也检查用户目录下的 Applications
    const homeDir = process.env.HOME || '';
    if (homeDir) {
      candidates.push(path.join(homeDir, 'Applications', 'Kiro.app', 'Contents', 'MacOS', 'Kiro'));
    }
  } else {
    candidates.push('/usr/bin/kiro', '/usr/local/bin/kiro', '/opt/Kiro/kiro');
    // 也检查用户本地目录
    const homeDir = process.env.HOME || '';
    if (homeDir) {
      candidates.push(
        path.join(homeDir, '.local', 'bin', 'kiro'),
        path.join(homeDir, 'bin', 'kiro')
      );
    }
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  throw new Error('未找到 Kiro 客户端，请在配置里填写 Kiro 可执行文件路径');
}

async function readStoredAccounts() {
  try {
    const raw = await fs.readFile(accountsFilePath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function appendStoredAccount(providerId, entry) {
  const account = entry?.account || {};
  const record = {
    id: `${providerId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    providerId,
    status: entry?.status || 'success',
    email: account.email || '',
    username: account.username || '',
    fullName: account.fullName || '',
    password: account.password || '',
    ssoCookieName: entry?.ssoCookieName || '',
    ssoTokenPreview: entry?.ssoTokenPreview || '',
    createdAt: new Date().toISOString()
  };
  const list = await readStoredAccounts();
  list.unshift(record);
  await fs.mkdir(path.dirname(accountsFilePath()), { recursive: true });
  await fs.writeFile(accountsFilePath(), `${JSON.stringify(list, null, 2)}\n`, 'utf8');
  return record;
}

async function updateAccountQuota(accountId, quotaData) {
  try {
    const list = await readStoredAccounts();
    const index = list.findIndex(a => a.id === accountId);
    if (index === -1) return;
    
    list[index] = {
      ...list[index],
      quotaUsed: quotaData.quotaUsed ?? list[index].quotaUsed,
      quotaTotal: quotaData.quotaTotal ?? list[index].quotaTotal,
      availableModels: quotaData.availableModels?.length > 0 ? quotaData.availableModels : list[index].availableModels,
      lastQuotaSyncAt: new Date().toISOString()
    };
    
    await fs.mkdir(path.dirname(accountsFilePath()), { recursive: true });
    await fs.writeFile(accountsFilePath(), `${JSON.stringify(list, null, 2)}\n`, 'utf8');
  } catch (error) {
    console.error('[updateAccountQuota] Error:', error.message);
  }
}

async function launchKiroClient(payload) {
  const accountId = String(payload?.accountId || '').trim();
  if (!accountId) throw new Error('缺少账号 ID');

  const profilePath = kiroProfilePath(accountId);
  const executablePath = await resolveKiroExecutable(payload?.executablePath);
  await fs.mkdir(profilePath, { recursive: true });

  const args = [
    '--user-data-dir',
    profilePath
  ];
  const workspacePath = String(payload?.workspacePath || '').trim();
  if (workspacePath) args.push(workspacePath);

  // Apply proxy configuration if provided
  const proxyConfig = payload?.proxyConfig;
  if (proxyConfig && proxyConfig.enabled) {
    const { server, port, protocol, username, password } = proxyConfig;
    
    // Build proxy server URL
    let proxyUrl = `${protocol || 'http'}://${server}:${port}`;
    
    // Add authentication if provided
    if (username && password) {
      proxyUrl = `${protocol || 'http'}://${username}:${password}@${server}:${port}`;
    }
    
    // Add Chromium proxy arguments
    args.push(`--proxy-server=${proxyUrl}`);
  }

  return new Promise((resolve, reject) => {
    // 移除 detached: true，保留父子进程连接以支持单实例检测
    const child = spawn(executablePath, args, {
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true
    });

    let settled = false;

    // 立即返回，让 Kiro 自行处理单实例逻辑
    // 如果已存在实例，Kiro 会聚焦现有窗口；否则打开新窗口
    // 会话数据由 --user-data-dir 保证持久化
    setTimeout(() => {
      if (!settled) {
        settled = true;
        child.unref();
        resolve({
          ok: true,
          executablePath,
          profilePath,
          pid: child.pid,
          launchedAt: new Date().toISOString(),
          proxyApplied: !!(proxyConfig && proxyConfig.enabled)
        });
      }
    }, 500);

    child.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(new Error(`启动 Kiro 失败: ${err.message}`));
      }
    });

    child.on('exit', (code) => {
      if (!settled) {
        settled = true;
        // 立即退出通常意味着单实例检测生效（已有实例在运行）
        if (code === 0 || code === null) {
          resolve({
            ok: true,
            executablePath,
            profilePath,
            pid: child.pid,
            launchedAt: new Date().toISOString(),
            proxyApplied: !!(proxyConfig && proxyConfig.enabled),
            reusedExisting: true
          });
        } else {
          reject(new Error(`Kiro 进程退出，代码: ${code}`));
        }
      }
    });
  });
}

function pickLoginCookie(cookies, cookieName) {
  const expectedName = String(cookieName || 'x-amz-sso_authn').trim();
  return cookies.find((cookie) => cookie.name === expectedName && cookie.value)
    || cookies.find((cookie) => /sso|auth|session|token/i.test(cookie.name) && cookie.value)
    || null;
}

function walkJson(value, visit, pathParts = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkJson(item, visit, [...pathParts, String(index)]));
    return;
  }

  visit(value, pathParts);
  for (const [key, child] of Object.entries(value)) {
    walkJson(child, visit, [...pathParts, key]);
  }
}

function readNumberByKeys(source, keys) {
  if (!source || typeof source !== 'object') return null;
  for (const [key, value] of Object.entries(source)) {
    if (keys.some((pattern) => pattern.test(key)) && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function extractUsageAndModels(json) {
  const result = {
    quotaUsed: null,
    quotaTotal: null,
    availableModels: []
  };

  walkJson(json, (node) => {
    if (result.quotaUsed === null) {
      result.quotaUsed = readNumberByKeys(node, [/used/i, /consumed/i, /usage/i, /creditsUsed/i]);
    }
    if (result.quotaTotal === null) {
      result.quotaTotal = readNumberByKeys(node, [/limit/i, /total/i, /quota/i, /credits/i, /monthly/i]);
    }

    for (const [key, value] of Object.entries(node)) {
      if (!/model/i.test(key)) continue;
      if (Array.isArray(value)) {
        const names = value
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') return item.name || item.displayName || item.label || item.id;
            return '';
          })
          .filter(Boolean);
        if (names.length > result.availableModels.length) result.availableModels = names;
      } else if (typeof value === 'string' && value.length <= 80) {
        result.availableModels.push(value);
      }
    }
  });

  result.availableModels = [...new Set(result.availableModels)];
  return result;
}

function isInterestingKiroApi(url) {
  return /kiro|amazonaws|awsapps|builder/i.test(url)
    && /usage|quota|credit|billing|subscription|entitlement|model|profile|account/i.test(url);
}

async function captureKiroWebAccount(payload) {
  const { chromium } = require('playwright');
  const accountId = `kiro_manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const profilePath = kiroWebProfilePath(accountId);
  const storageStatePath = kiroStorageStatePath(accountId);
  const url = String(payload?.url || 'https://app.kiro.dev').trim() || 'https://app.kiro.dev';
  const cookieName = String(payload?.kiroFlow?.cookieName || 'x-amz-sso_authn').trim() || 'x-amz-sso_authn';
  const maxWaitSeconds = Math.max(30, Math.min(Number(payload?.maxWaitSeconds || payload?.kiroFlow?.maxWaitSeconds || 300), 900));
  const discoveredApis = [];
  let discoveredUsage = {};

  await fs.mkdir(path.dirname(storageStatePath), { recursive: true });
  
  // Build context options with proxy configuration if provided
  const contextOptions = {
    headless: false,
    slowMo: 80,
    viewport: { width: 1280, height: 820 }
  };
  
  // Apply proxy configuration if provided
  const proxyConfig = payload?.proxyConfig;
  if (proxyConfig && proxyConfig.enabled) {
    const { server, port, protocol, username, password } = proxyConfig;
    
    // Build proxy server URL
    const proxyServer = `${protocol || 'http'}://${server}:${port}`;
    
    contextOptions.proxy = {
      server: proxyServer
    };
    
    // Add authentication if provided
    if (username && password) {
      contextOptions.proxy.username = username;
      contextOptions.proxy.password = password;
    }
  }
  
  const context = await chromium.launchPersistentContext(profilePath, contextOptions);

  let page = context.pages()[0] || await context.newPage();
  page.on('response', async (response) => {
    const responseUrl = response.url();
    if (!isInterestingKiroApi(responseUrl)) return;
    const item = {
      url: responseUrl,
      method: response.request().method(),
      status: response.status()
    };
    if (!discoveredApis.some((api) => api.url === item.url && api.method === item.method)) {
      discoveredApis.push(item);
    }

    const contentType = response.headers()['content-type'] || '';
    if (!contentType.includes('json')) return;
    try {
      const json = await response.json();
      const extracted = extractUsageAndModels(json);
      if (extracted.quotaUsed !== null) discoveredUsage.quotaUsed = extracted.quotaUsed;
      if (extracted.quotaTotal !== null) discoveredUsage.quotaTotal = extracted.quotaTotal;
      if (extracted.availableModels.length > 0) discoveredUsage.availableModels = extracted.availableModels;
    } catch (_error) {}
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  let hit = null;
  const startAt = Date.now();
  while (Date.now() - startAt < maxWaitSeconds * 1000) {
    try {
      const cookies = await context.cookies();
      hit = pickLoginCookie(cookies, cookieName);
      if (hit) break;
      await page.waitForTimeout(1000);
    } catch (e) {
      // Browser was closed by user — silently abort
      if (e.message && (e.message.includes('closed') || e.message.includes('Target page'))) {
        try { await context.close(); } catch (_) {}
        return { ok: false, reason: 'browser_closed' };
      }
      throw e;
    }
  }

  if (!hit) {
    await context.close();
    throw new Error(`等待登录超时，未检测到 ${cookieName} 或登录会话 Cookie`);
  }

  // 等待额度 API 被调用（最多额外等待 10 秒）
  const quotaWaitStart = Date.now();
  const quotaWaitTimeout = 10000;
  while (Date.now() - quotaWaitStart < quotaWaitTimeout) {
    try {
      if (discoveredUsage.quotaUsed !== null || discoveredUsage.quotaTotal !== null) {
        break;
      }
      await page.waitForTimeout(500);
    } catch (e) {
      if (e.message && (e.message.includes('closed') || e.message.includes('Target page'))) {
        break; // quota already captured enough, or browser closed — continue
      }
      throw e;
    }
  }

  await context.storageState({ path: storageStatePath });
  const title = await page.title().catch(() => '');
  const currentUrl = page.url();
  await context.close();

  const account = {
    id: accountId,
    providerId: 'kiro',
    status: 'success',
    username: title || 'Kiro 手动添加账号',
    email: '',
    note: '网页登录态添加',
    authMode: 'web-session',
    webProfilePath: profilePath,
    storageStatePath,
    localFilePath: accountsFilePath(),
    ssoCookieName: hit.name,
    ssoTokenPreview: `${hit.value.slice(0, 50)}...`,
    quotaUsed: 0,
    quotaTotal: 0,
    ...discoveredUsage,
    availableModels: discoveredUsage.availableModels || DEFAULT_KIRO_MODELS,
    discoveredApis,
    lastLoginUrl: currentUrl,
    addedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  const list = await readStoredAccounts();
  list.unshift(account);
  await fs.mkdir(path.dirname(accountsFilePath()), { recursive: true });
  await fs.writeFile(accountsFilePath(), `${JSON.stringify(list, null, 2)}\n`, 'utf8');

  return {
    ok: true,
    account
  };
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCode(text) {
  const source = String(text || '');
  for (const pattern of CODE_PATTERNS) {
    const matches = source.matchAll(pattern);
    for (const match of matches) {
      const code = match?.[1];
      if (code && /^\d{6}$/.test(code)) return code;
    }
  }
  return null;
}

function randomString(len = 8) {
  const seed = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return seed.slice(0, len);
}

function generateRandomFullName() {
  const firstNames = ['Alex', 'Mason', 'Ryan', 'Daniel', 'Evan', 'Noah', 'Liam', 'Owen', 'Lucas', 'Ethan', 'Emma', 'Sophia', 'Mia', 'Ava', 'Chloe'];
  const lastNames = ['Chen', 'Lee', 'Smith', 'Wu', 'Taylor', 'Wang', 'Lin', 'Zhang', 'Brown', 'Wilson', 'Liu', 'Yang', 'Clark', 'Hall', 'Young'];
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${first} ${last}`;
}

function generateDefaultPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = `${upper}${lower}${digits}${symbols}`;
  const pick = (chars) => chars[Math.floor(Math.random() * chars.length)];
  const rest = Array.from({ length: 10 }, () => pick(all));
  return [pick(upper), pick(lower), pick(digits), pick(symbols), ...rest].sort(() => Math.random() - 0.5).join('');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 980,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  Menu.setApplicationMenu(null);

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function sendAutomationProgress(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('automation:progress', payload);
  }
}

function logLine(logs, line, extra = {}) {
  logs.push(line);
  sendAutomationProgress({
    type: 'log',
    line,
    ...extra
  });
}

async function sendPagePreview(page, label, extra = {}) {
  try {
    const screenshot = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false });
    sendAutomationProgress({
      type: 'preview',
      label,
      image: `data:image/jpeg;base64,${screenshot.toString('base64')}`,
      pageUrl: page.url(),
      ...extra
    });
  } catch (_error) {}
}

function normalizeChromeVersion(version) {
  const match = String(version || '').match(/(\d+\.\d+\.\d+\.\d+)/);
  return match ? match[1] : '';
}

function buildFingerprintProfile(type, browserVersion = '') {
  if (!type || type === 'none') return null;

  const forceOSMap = {
    windows_chrome: 'Windows',
    mac_chrome: 'macOS',
    linux_chrome: 'Linux'
  };

  const forceOS = type === 'random' ? undefined : forceOSMap[type];
  const profile = fingerprintGenerator.generate({
    forceOS,
    chromeVersion: normalizeChromeVersion(browserVersion)
  });
  const checked = fingerprintValidator.validate(profile);
  if (!checked.valid) {
    return fingerprintValidator.autoFixInconsistencies(profile);
  }
  return profile;
}

function buildContextOptionsFromProfile(profile) {
  if (!profile) return {};
  return {
    userAgent: profile.navigator.userAgent,
    locale: profile.navigator.language || 'en-US',
    timezoneId: profile.timezone.name,
    viewport: {
      width: profile.screen.width,
      height: profile.screen.height
    },
    deviceScaleFactor: profile.screen.devicePixelRatio
  };
}

function buildAccount(baseConfig, idx, mailboxResult) {
  const runId = Date.now();
  const suffix = `${runId}${String(idx + 1).padStart(3, '0')}`;
  const username = `${baseConfig.usernamePrefix}${suffix}`;
  const email = mailboxResult?.email || `${username}@${baseConfig.emailDomain}`;
  const password = mailboxResult?.password || baseConfig.password || generateDefaultPassword();
  const fullName = String(baseConfig.fullName || generateRandomFullName()).trim();
  const birthYear = String(baseConfig.birthYear || 1998);
  const birthMonth = String(baseConfig.birthMonth || 1);
  const birthDay = String(baseConfig.birthDay || 1);

  return {
    username,
    fullName,
    email,
    password,
    birthYear,
    birthMonth,
    birthDay,
    mailbox: mailboxResult
  };
}

async function waitForAnyVisible(page, selectors, timeout = 15000) {
  const perSelectorTimeout = Math.max(1200, Math.floor(timeout / Math.max(selectors.length, 1)));
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      await locator.waitFor({ state: 'visible', timeout: perSelectorTimeout });
      return { selector, locator };
    } catch (_error) {}
  }
  return null;
}

async function fillFirstVisible(page, selectors, value, logs, label, entry) {
  const found = await waitForAnyVisible(page, selectors, 30000);
  if (!found) {
    throw new Error(`未找到${label}`);
  }
  await found.locator.click({ timeout: 5000 }).catch(() => {});
  await found.locator.fill(value, { timeout: 10000 });
  logLine(logs, `[${entry.index}] 已填写${label}: ${found.selector}`, { stage: label, index: entry.index });
  return found.selector;
}

async function clickFirstVisible(page, selectors, logs, label, entry, timeout = 20000) {
  const found = await waitForAnyVisible(page, selectors, timeout);
  if (!found) {
    throw new Error(`未找到${label}`);
  }
  await found.locator.click({ timeout: 10000 });
  logLine(logs, `[${entry.index}] 已点击${label}: ${found.selector}`, { stage: label, index: entry.index });
  return found.selector;
}

async function findEditableNow(page, selectors) {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector);
      const count = Math.min(await locator.count(), 4);
      for (let i = 0; i < count; i += 1) {
        const item = locator.nth(i);
        const visible = await item.isVisible({ timeout: 250 }).catch(() => false);
        const editable = await item.isEditable({ timeout: 250 }).catch(() => false);
        if (visible && editable) {
          return { selector: count > 1 ? `${selector} [${i + 1}]` : selector, locator: item };
        }
      }
    } catch (_error) {}
  }
  return null;
}

async function fillFirstAvailableLabel(page, labels, value) {
  for (const label of labels) {
    try {
      const locator = page.getByLabel(label).first();
      if (await locator.isVisible({ timeout: 900 })) {
        await locator.fill(value, { timeout: 5000 });
        return String(label);
      }
    } catch (_error) {}
  }
  return '';
}

async function isLikelyBlankPage(page) {
  try {
    const snapshot = await page.evaluate(() => {
      const text = document.body?.innerText?.trim() || '';
      return {
        textLength: text.length,
        inputCount: document.querySelectorAll('input, textarea, select').length,
        buttonCount: document.querySelectorAll('button, a, [role="button"], [role="link"]').length
      };
    });
    return snapshot.textLength < 20 && snapshot.inputCount === 0 && snapshot.buttonCount === 0;
  } catch (_error) {
    return false;
  }
}

async function fillNameOrUsername(page, selectors, value, logs, entry, timeout = 90000) {
  const labels = [/Full name/i, /Name/i, /姓名/, /用户名/, /名字/, /全名/, /名称/];
  const startedAt = Date.now();
  let lastNoticeAt = 0;
  let reloadedBlankPage = false;

  while (Date.now() - startedAt < timeout) {
    const passwordPage = await waitForAnyVisible(page, ['input[placeholder="Enter password"]'], 1200);
    if (passwordPage) {
      logLine(logs, `[${entry.index}] 页面进入已有账号登录分支，当前流程按注册账号设计，停止继续`, { stage: 'login-branch', index: entry.index });
      throw new Error('当前邮箱已进入登录分支，请更换邮箱后重试');
    }

    const labelSelector = await fillFirstAvailableLabel(page, labels, value);
    if (labelSelector) {
      logLine(logs, `[${entry.index}] 已按标签填写姓名/用户名: ${labelSelector}`, { stage: '姓名/用户名', index: entry.index });
      return labelSelector;
    }

    const found = await waitForAnyVisible(page, selectors, 4000);
    if (found) {
      await found.locator.click({ timeout: 5000 }).catch(() => {});
      await found.locator.fill(value, { timeout: 10000 });
      logLine(logs, `[${entry.index}] 已填写姓名/用户名: ${found.selector}`, { stage: '姓名/用户名', index: entry.index });
      return found.selector;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed - lastNoticeAt > 12000) {
      lastNoticeAt = elapsed;
      logLine(logs, `[${entry.index}] 仍在等待姓名/用户名输入框出现，页面可能还在加载或白屏`, { stage: 'name-wait', index: entry.index });
      await sendPagePreview(page, '等待姓名/用户名输入框出现', { stage: 'name-wait', index: entry.index });
    }

    if (!reloadedBlankPage && elapsed > 25000 && await isLikelyBlankPage(page)) {
      reloadedBlankPage = true;
      logLine(logs, `[${entry.index}] 检测到页面疑似白屏，尝试刷新当前页后继续等待`, { stage: 'blank-reload', index: entry.index });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
    } else {
      await page.waitForTimeout(1500);
    }
  }

  throw new Error('等待姓名/用户名输入框超时，请检查页面是否白屏、网络是否卡住，或手动填写用户名/姓名输入框选择器');
}

async function readVisiblePageErrors(page) {
  try {
    const messages = await page.evaluate(() => {
      const errorSelector = [
        '[role="alert"]',
        '[aria-live="assertive"]',
        '[aria-live="polite"]',
        '[aria-invalid="true"]',
        '[class*="error" i]',
        '[class*="invalid" i]',
        '[data-testid*="error" i]',
        '[id*="error" i]'
      ].join(',');
      const nodes = Array.from(document.querySelectorAll(errorSelector));
      const visibleText = (node) => {
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return '';
        const text = node.innerText || node.getAttribute('aria-label') || node.getAttribute('validationMessage') || '';
        return text.replace(/\s+/g, ' ').trim();
      };
      return nodes
        .map(visibleText)
        .filter((text) => text.length >= 2 && text.length <= 240);
    });
    return [...new Set(messages)].slice(0, 3);
  } catch (_error) {
    return [];
  }
}

async function waitForEditable(page, selectors, timeout = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    for (const selector of selectors) {
      try {
        const locator = page.locator(selector);
        const count = Math.min(await locator.count(), 5);
        for (let i = 0; i < count; i += 1) {
          const item = locator.nth(i);
          if (await item.isVisible({ timeout: 500 }) && await item.isEditable({ timeout: 500 })) {
            return { selector: count > 1 ? `${selector} [${i + 1}]` : selector, locator: item };
          }
        }
      } catch (_error) {}
    }
    await page.waitForTimeout(800);
  }
  return null;
}

async function fillEditable(locator, value) {
  await locator.click({ timeout: 5000 }).catch(() => {});
  await locator.fill('', { timeout: 5000 }).catch(() => {});
  try {
    await locator.fill(value, { timeout: 10000 });
  } catch (_error) {
    try {
      await locator.pressSequentially(value, { delay: 35, timeout: 15000 });
    } catch (__error) {
      await setNativeInputValue(locator, value);
    }
  }
}

async function setNativeInputValue(locator, value) {
  await locator.evaluate((node, nextValue) => {
    const input = node;
    const proto = window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) {
      setter.call(input, nextValue);
    } else {
      input.value = nextValue;
    }
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: nextValue }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
  }, value);
}

async function getEditablePasswordFields(page) {
  const fields = [];
  const locator = page.locator('input[type="password"]');
  const seen = new Set();
  const count = Math.min(await locator.count().catch(() => 0), 8);

  for (let i = 0; i < count; i += 1) {
    const field = locator.nth(i);
    const meta = await field.evaluate((node, index) => {
      const rect = node.getBoundingClientRect();
      return {
        index,
        key: `${Math.round(rect.left)}:${Math.round(rect.top)}:${Math.round(rect.width)}:${Math.round(rect.height)}:${node.placeholder || ''}`,
        top: rect.top,
        left: rect.left
      };
    }, i).catch(() => null);
    if (!meta || seen.has(meta.key)) continue;
    seen.add(meta.key);

    if (await field.isVisible({ timeout: 500 }).catch(() => false) && await field.isEditable({ timeout: 500 }).catch(() => false)) {
      fields.push({ locator: field, top: meta.top, left: meta.left });
    }
  }

  return fields
    .sort((a, b) => a.top - b.top || a.left - b.left)
    .map((item) => item.locator);
}

async function waitForEditablePasswordPair(page, timeout = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const fields = await getPasswordFieldsByLabel(page) || await getEditablePasswordFields(page);
    if (fields.length >= 2) return fields.slice(0, 2);
    await page.waitForTimeout(800);
  }
  return null;
}

async function getPasswordFieldsByLabel(page) {
  const passwordField = page.getByLabel(/^Password$/i).first();
  const confirmField = page.getByLabel(/^Confirm password$/i).first();
  const passwordReady = await passwordField.isVisible({ timeout: 500 }).catch(() => false)
    && await passwordField.isEditable({ timeout: 500 }).catch(() => false);
  const confirmReady = await confirmField.isVisible({ timeout: 500 }).catch(() => false)
    && await confirmField.isEditable({ timeout: 500 }).catch(() => false);
  if (!passwordReady || !confirmReady) return null;

  const sameNode = await passwordField.evaluate((node, confirm) => node === confirm, await confirmField.elementHandle()).catch(() => false);
  return sameNode ? null : [passwordField, confirmField];
}

async function readInputValue(locator) {
  return locator.inputValue({ timeout: 5000 }).catch(() => '');
}

async function fillPasswordFields(page, _passwordInputSelectors, _confirmPasswordSelectors, password, logs, entry) {
  const fields = await waitForEditablePasswordPair(page, 30000);
  if (!fields) {
    const pageErrors = await readVisiblePageErrors(page);
    throw new Error(pageErrors.length > 0 ? `密码输入框不可编辑: ${pageErrors.join(' | ')}` : '未找到两个可编辑的密码输入框');
  }

  await fillEditable(fields[0], password);
  logLine(logs, `[${entry.index}] 已填写密码: 第 1 个密码框`, { stage: '密码', index: entry.index });
  await fillEditable(fields[1], password);
  logLine(logs, `[${entry.index}] 已填写确认密码: 第 2 个密码框`, { stage: '确认密码', index: entry.index });

  let firstValue = await readInputValue(fields[0]);
  let secondValue = await readInputValue(fields[1]);
  if (firstValue !== password || secondValue !== password) {
    logLine(logs, `[${entry.index}] 密码字段校验不一致，使用原生输入事件补写两个密码框`, { stage: '密码', index: entry.index });
    await setNativeInputValue(fields[0], password);
    await setNativeInputValue(fields[1], password);
    firstValue = await readInputValue(fields[0]);
    secondValue = await readInputValue(fields[1]);
  }
  if (firstValue !== password || secondValue !== password) {
    throw new Error(`密码填写校验失败: 第 1 个密码框长度 ${firstValue.length}，第 2 个密码框长度 ${secondValue.length}`);
  }
}

async function fillPasswordFieldsWithReloadRetry(page, passwordInputSelectors, confirmPasswordSelectors, password, logs, entry) {
  try {
    await fillPasswordFields(page, passwordInputSelectors, confirmPasswordSelectors, password, logs, entry);
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logLine(logs, `[${entry.index}] 填写密码失败，尝试刷新页面后重试: ${message}`, { stage: 'password-retry', index: entry.index });
    await sendPagePreview(page, '填写密码失败，准备刷新重试', { stage: 'password-retry', index: entry.index });
  }

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await waitForPasswordPage(page, passwordInputSelectors, logs, entry);
  await fillPasswordFields(page, passwordInputSelectors, confirmPasswordSelectors, password, logs, entry);
}

function birthdayMarkers() {
  return [
    'text=/生日|出生日期|出生年月|Birth date|Birthday|Date of birth/i',
    'input[name*="birth" i]',
    'input[id*="birth" i]',
    'select[name*="birth" i]',
    'select[id*="birth" i]'
  ];
}

async function isLikelyVerificationCodePage(page) {
  try {
    return await page.evaluate(() => {
      const text = document.body?.innerText || '';
      const url = window.location.href;
      return /verification|verify|code|验证码|验证/i.test(text) || /verification|verify|code/i.test(url);
    });
  } catch (_error) {
    return false;
  }
}

async function waitForVerificationCodeInput(page, selectors, timeout = 2500) {
  const found = await waitForAnyVisible(page, selectors, timeout);
  if (!found) return null;
  if (!await isLikelyVerificationCodePage(page)) return null;
  return found;
}

async function detectRegistrationRequirements(page, selectors) {
  const [emailField, nameField, codeField] = await Promise.all([
    findEditableNow(page, selectors.emailInputSelectors),
    findEditableNow(page, selectors.nameInputSelectors),
    findEditableNow(page, selectors.codeInputSelectors)
  ]);
  const passwordFields = await getEditablePasswordFields(page);
  const pageErrors = await readVisiblePageErrors(page);
  const isVerifyPage = codeField ? await isLikelyVerificationCodePage(page) : false;

  return {
    emailField,
    nameField,
    codeField: isVerifyPage ? codeField : null,
    passwordFields,
    pageErrors
  };
}

async function driveRegistrationByPageState(page, account, logs, entry, selectors, recentHttpErrors, options = {}) {
  const timeout = Number(options.timeout || 70000);
  const reloadMax = Math.max(0, Number(options.reloadMax ?? 3));
  const startedAt = Date.now();
  let lastNoticeAt = 0;
  let reloadAttempts = 0;
  let safetyCycles = 0;

  while (Date.now() - startedAt < timeout) {
    safetyCycles += 1;
    if (safetyCycles > 14) break;

    const state = await detectRegistrationRequirements(page, selectors);
    const recentBadRequest = recentHttpErrors.find((item) => Date.now() - item.at < 30000);
    if (state.pageErrors.length > 0 || recentBadRequest) {
      const messages = [];
      if (state.pageErrors.length > 0) messages.push(state.pageErrors.join(' | '));
      if (recentBadRequest) messages.push(`HTTP ${recentBadRequest.status}: ${recentBadRequest.url}`);
      const message = messages.join(' | ');
      logLine(logs, `[${entry.index}] 主流程检测到页面报错: ${message}`, { stage: 'state-error', index: entry.index });
      await sendPagePreview(page, '主流程页面报错', { stage: 'state-error', index: entry.index });

      if (reloadAttempts < reloadMax) {
        reloadAttempts += 1;
        logLine(logs, `[${entry.index}] 主流程尝试刷新恢复 (${reloadAttempts}/${reloadMax})`, { stage: 'state-error-reload', index: entry.index });
        recentHttpErrors.length = 0;
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2500);
        continue;
      }
      throw new Error(`主流程失败: 页面连续报错，刷新 ${reloadMax} 次仍未恢复: ${message}`);
    }

    if (state.codeField) {
      logLine(logs, `[${entry.index}] 页面识别结果: 需要填写邮箱验证码`, { stage: 'state-code', index: entry.index });
      return 'code';
    }

    if (state.passwordFields.length >= 2) {
      logLine(logs, `[${entry.index}] 页面识别结果: 需要设置密码`, { stage: 'state-password', index: entry.index });
      return 'password';
    }

    if (state.nameField) {
      await fillEditable(state.nameField.locator, account.fullName);
      logLine(logs, `[${entry.index}] 页面识别结果: 需要姓名，已填写 ${state.nameField.selector}`, { stage: 'state-name', index: entry.index });
      await clickFirstVisible(page, selectors.firstContinueSelectors, logs, '主流程 Continue 按钮', entry, 12000);
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1200);
      continue;
    }

    if (state.emailField) {
      await fillEditable(state.emailField.locator, account.email);
      logLine(logs, `[${entry.index}] 页面识别结果: 需要邮箱，已填写 ${state.emailField.selector}`, { stage: 'state-email', index: entry.index });
      await clickFirstVisible(page, selectors.firstContinueSelectors, logs, '主流程 Continue 按钮', entry, 12000);
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1200);
      continue;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed - lastNoticeAt > 10000) {
      lastNoticeAt = elapsed;
      logLine(logs, `[${entry.index}] 主流程尚未识别出可填写字段，继续等待页面加载`, { stage: 'state-wait', index: entry.index });
      await sendPagePreview(page, '主流程等待字段出现', { stage: 'state-wait', index: entry.index });
    }

    await page.waitForTimeout(1200);
  }

  throw new Error('主流程超时: 未识别出下一步所需字段（姓名/邮箱/验证码/密码）');
}

async function waitForVerificationCodePage(page, codeInputSelectors, account, logs, entry, continueSelectors, options = {}) {
  const timeout = options.timeout || 60000;
  const allowBirthday = options.allowBirthday !== false;
  const recentHttpErrors = options.recentHttpErrors || [];
  const reloadMax = Math.max(0, Number(options.reloadMax ?? 3));
  const startedAt = Date.now();
  let lastNoticeAt = 0;
  let reloadAttempts = options.reloadAttempts || 0;

  while (Date.now() - startedAt < timeout) {
    if (allowBirthday && await waitForAnyVisible(page, birthdayMarkers(), 1500)) {
      await handleOptionalBirthdayStep(page, account, logs, entry, continueSelectors);
      return waitForVerificationCodePage(page, codeInputSelectors, account, logs, entry, continueSelectors, {
        timeout,
        allowBirthday: false,
        recentHttpErrors,
        reloadMax,
        reloadAttempts
      });
    }

    const pageErrors = await readVisiblePageErrors(page);
    const recentBadRequest = recentHttpErrors.find((item) => Date.now() - item.at < 30000);
    if (pageErrors.length > 0 || recentBadRequest) {
      const messages = [];
      if (pageErrors.length > 0) messages.push(pageErrors.join(' | '));
      if (recentBadRequest) messages.push(`HTTP ${recentBadRequest.status}: ${recentBadRequest.url}`);
      const message = messages.join(' | ');
      logLine(logs, `[${entry.index}] 姓名/用户名提交后页面报错: ${message}`, { stage: 'name-error', index: entry.index });
      await sendPagePreview(page, '姓名/用户名提交后页面报错', { stage: 'name-error', index: entry.index });

      if (reloadAttempts < reloadMax) {
        reloadAttempts += 1;
        logLine(logs, `[${entry.index}] 尝试刷新页面恢复验证码步骤 (${reloadAttempts}/${reloadMax})`, { stage: 'name-error-reload', index: entry.index });
        recentHttpErrors.length = 0;
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
        continue;
      }

      throw new Error(`本次注册失败: 姓名/用户名提交后页面连续报错，刷新 ${reloadMax} 次仍未恢复: ${message}`);
    }

    const codeInput = await waitForVerificationCodeInput(page, codeInputSelectors, 2500);
    if (codeInput) {
      logLine(logs, `[${entry.index}] 已确认进入邮箱验证码页面: ${codeInput.selector}`, { stage: 'verify-code', index: entry.index });
      return codeInput.selector;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed - lastNoticeAt > 10000) {
      lastNoticeAt = elapsed;
      logLine(logs, `[${entry.index}] 已点击姓名/用户名 Continue，仍在确认是否进入验证码页面`, { stage: 'verify-wait', index: entry.index });
      await sendPagePreview(page, '等待进入邮箱验证码页面', { stage: 'verify-wait', index: entry.index });
    }
    await page.waitForTimeout(1500);
  }

  await sendPagePreview(page, '未确认进入邮箱验证码页面', { stage: 'verify-timeout', index: entry.index });
  if (reloadAttempts < reloadMax) {
    reloadAttempts += 1;
    logLine(logs, `[${entry.index}] 未确认进入验证码页面，尝试刷新页面恢复 (${reloadAttempts}/${reloadMax})`, { stage: 'verify-timeout-reload', index: entry.index });
    recentHttpErrors.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    return waitForVerificationCodePage(page, codeInputSelectors, account, logs, entry, continueSelectors, {
      timeout,
      allowBirthday,
      recentHttpErrors,
      reloadMax,
      reloadAttempts
    });
  }
  throw new Error(`本次注册失败: 点击姓名/用户名 Continue 后，刷新 ${reloadMax} 次仍未确认进入邮箱验证码页面`);
}

async function waitForPasswordPage(page, passwordInputSelectors, logs, entry, timeout = 60000) {
  const startedAt = Date.now();
  let lastNoticeAt = 0;

  while (Date.now() - startedAt < timeout) {
    const passwordField = await waitForEditable(page, passwordInputSelectors, 2500);
    if (passwordField) {
      logLine(logs, `[${entry.index}] 已确认进入密码设置页面: ${passwordField.selector}`, { stage: 'password', index: entry.index });
      return passwordField.selector;
    }

    const pageErrors = await readVisiblePageErrors(page);
    if (pageErrors.length > 0) {
      const message = pageErrors.join(' | ');
      logLine(logs, `[${entry.index}] 验证码提交后页面报错: ${message}`, { stage: 'verify-error', index: entry.index });
      await sendPagePreview(page, '验证码提交后页面报错', { stage: 'verify-error', index: entry.index });
      throw new Error(`验证码提交后页面报错: ${message}`);
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed - lastNoticeAt > 10000) {
      lastNoticeAt = elapsed;
      logLine(logs, `[${entry.index}] 已提交验证码，仍在等待可编辑的密码输入框`, { stage: 'password-wait', index: entry.index });
    }
    await page.waitForTimeout(1200);
  }

  throw new Error('提交验证码后，未等到可编辑的密码输入框');
}

async function waitAfterPasswordSubmit(page, passwordInputSelectors, authConfirmSelectors, allowAccessSelectors, recentHttpErrors, logs, entry, timeout = 45000, reloadAttempts = 0, reloadMax = 3) {
  reloadMax = Math.max(0, Number(reloadMax ?? 3));
  const startedAt = Date.now();
  let lastNoticeAt = 0;

  while (Date.now() - startedAt < timeout) {
    const authButton = await waitForAnyVisible(page, authConfirmSelectors, 1500);
    if (authButton) return 'auth';

    const allowButton = await waitForAnyVisible(page, allowAccessSelectors, 1500);
    if (allowButton) return 'allow';

    const passwordField = await waitForEditable(page, passwordInputSelectors, 1200);
    const pageErrors = await readVisiblePageErrors(page);
    const recentBadRequest = recentHttpErrors.find((item) => Date.now() - item.at < 30000);

    if (pageErrors.length > 0 || recentBadRequest) {
      const messages = [];
      if (pageErrors.length > 0) messages.push(pageErrors.join(' | '));
      if (recentBadRequest) messages.push(`HTTP ${recentBadRequest.status}: ${recentBadRequest.url}`);
      const message = messages.join(' | ');
      logLine(logs, `[${entry.index}] 密码提交后页面仍停留/返回错误: ${message}`, { stage: 'password-error', index: entry.index });
      await sendPagePreview(page, '密码提交后页面错误', { stage: 'password-error', index: entry.index });

      if (reloadAttempts < reloadMax) {
        reloadAttempts += 1;
        logLine(logs, `[${entry.index}] 尝试刷新页面恢复授权步骤 (${reloadAttempts}/${reloadMax})`, { stage: 'password-error-reload', index: entry.index });
        recentHttpErrors.length = 0;
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
        return waitAfterPasswordSubmit(page, passwordInputSelectors, authConfirmSelectors, allowAccessSelectors, recentHttpErrors, logs, entry, timeout, reloadAttempts, reloadMax);
      }

      throw new Error(`本次注册失败: 密码提交后连续报错，刷新 ${reloadMax} 次仍未恢复: ${message}`);
    }

    const elapsed = Date.now() - startedAt;
    if (passwordField && elapsed > 8000) {
      if (reloadAttempts < reloadMax) {
        reloadAttempts += 1;
        logLine(logs, `[${entry.index}] 密码提交后仍停留在密码页，尝试刷新恢复 (${reloadAttempts}/${reloadMax})`, { stage: 'password-stuck-reload', index: entry.index });
        recentHttpErrors.length = 0;
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(3000);
        return waitAfterPasswordSubmit(page, passwordInputSelectors, authConfirmSelectors, allowAccessSelectors, recentHttpErrors, logs, entry, timeout, reloadAttempts, reloadMax);
      }
      throw new Error(`本次注册失败: 密码提交后刷新 ${reloadMax} 次仍停留在密码页面，可能是密码策略不通过或请求被 AWS 拒绝`);
    }

    if (elapsed - lastNoticeAt > 10000) {
      lastNoticeAt = elapsed;
      logLine(logs, `[${entry.index}] 已提交密码，正在确认是否进入授权页面`, { stage: 'password-submit-wait', index: entry.index });
    }
    await page.waitForTimeout(1200);
  }

  if (reloadAttempts < reloadMax) {
    reloadAttempts += 1;
    logLine(logs, `[${entry.index}] 密码提交后未确认进入授权页，尝试刷新恢复 (${reloadAttempts}/${reloadMax})`, { stage: 'password-timeout-reload', index: entry.index });
    recentHttpErrors.length = 0;
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);
    return waitAfterPasswordSubmit(page, passwordInputSelectors, authConfirmSelectors, allowAccessSelectors, recentHttpErrors, logs, entry, timeout, reloadAttempts, reloadMax);
  }

  throw new Error(`本次注册失败: 密码提交后刷新 ${reloadMax} 次仍未确认进入授权页面`);
}

async function selectFirstAvailableLabel(page, labels, value) {
  for (const label of labels) {
    try {
      const locator = page.getByLabel(label).first();
      if (await locator.isVisible({ timeout: 900 })) {
        await locator.selectOption(value, { timeout: 5000 });
        return String(label);
      }
    } catch (_error) {}
  }
  return '';
}

async function selectKiroBuilderId(page, config, logs, entry) {
  const customProviderSelector = String(config?.selectors?.entry || '').trim();
  const providerSelectors = [
    ...(customProviderSelector ? [customProviderSelector] : []),
    'button:has-text("Builder ID")',
    'a:has-text("Builder ID")',
    'button:has-text("AWS Builder ID")',
    'a:has-text("AWS Builder ID")',
    '[role="button"]:has-text("Builder ID")',
    '[role="link"]:has-text("Builder ID")'
  ];

  const found = await waitForAnyVisible(page, providerSelectors, 12000);
  if (!found) {
    return false;
  }

  await found.locator.click({ timeout: 10000 });
  logLine(logs, `[${entry.index}] 图1: 已点击 Kiro 登录方式 Builder ID`, { stage: 'provider', index: entry.index });
  await page.waitForTimeout(2500);
  await sendPagePreview(page, '已选择 Builder ID', { stage: 'provider', index: entry.index });
  return true;
}

async function selectAwsBuilderIdEmailPath(page, logs, entry, emailInputSelectors) {
  const emailReady = await waitForAnyVisible(page, emailInputSelectors, 4000);
  if (emailReady) {
    logLine(logs, `[${entry.index}] 图2: 已进入 AWS Builder ID 邮箱页`, { stage: 'aws-entry', index: entry.index });
    return;
  }

  const existingAccountSelectors = [
    'button:has-text("I have an existing account")',
    'a:has-text("I have an existing account")',
    'button:has-text("Existing account")',
    'a:has-text("Existing account")',
    'button:has-text("Sign in with email")',
    'a:has-text("Sign in with email")',
    'button:has-text("Email")',
    'a:has-text("Email")',
    'button:has-text("Continue with email")',
    'a:has-text("Continue with email")'
  ];

  const found = await waitForAnyVisible(page, existingAccountSelectors, 12000);
  if (!found) {
    const emailLater = await waitForAnyVisible(page, emailInputSelectors, 5000);
    if (emailLater) {
      logLine(logs, `[${entry.index}] 图2: AWS Builder ID 页面已直接进入邮箱填写步骤`, { stage: 'aws-entry', index: entry.index });
      return;
    }
    throw new Error('未找到 AWS Builder ID 邮箱入口');
  }

  await found.locator.click({ timeout: 10000 });
  logLine(logs, `[${entry.index}] 已选择 AWS Builder ID 邮箱入口: ${found.selector}`, { stage: 'aws-entry', index: entry.index });
  await page.waitForTimeout(2200);
  await sendPagePreview(page, '已进入 AWS Builder ID 邮箱入口', { stage: 'aws-entry', index: entry.index });

  const emailFinal = await waitForAnyVisible(page, emailInputSelectors, 12000);
  if (!emailFinal) {
    throw new Error('进入 AWS Builder ID 邮箱入口后，未看到邮箱输入框');
  }
}

async function handleOptionalBirthdayStep(page, account, logs, entry, continueSelectors) {
  const marker = await waitForAnyVisible(page, birthdayMarkers(), 4000);
  if (!marker) {
    return false;
  }

  logLine(logs, `[${entry.index}] 检测到生日/出生日期页面，开始填写默认生日`, { stage: 'birthday', index: entry.index });

  const filledYear = await fillFirstAvailableLabel(page, [/Year/i, /年份/, /年/], account.birthYear)
    || await fillFirstVisible(page, ['input[name*="year" i]', 'input[id*="year" i]'], account.birthYear, logs, '出生年份', entry).catch(() => '');
  const filledMonth = await selectFirstAvailableLabel(page, [/Month/i, /月份/, /月/], account.birthMonth)
    || await fillFirstAvailableLabel(page, [/Month/i, /月份/, /月/], account.birthMonth)
    || await fillFirstVisible(page, ['input[name*="month" i]', 'input[id*="month" i]'], account.birthMonth, logs, '出生月份', entry).catch(() => '');
  const filledDay = await selectFirstAvailableLabel(page, [/Day/i, /日期/, /日/], account.birthDay)
    || await fillFirstAvailableLabel(page, [/Day/i, /日期/, /日/], account.birthDay)
    || await fillFirstVisible(page, ['input[name*="day" i]', 'input[id*="day" i]'], account.birthDay, logs, '出生日', entry).catch(() => '');

  if (!filledYear && !filledMonth && !filledDay) {
    throw new Error('检测到生日页面，但未找到可填写的生日字段');
  }

  await sendPagePreview(page, '已填写生日/出生日期', { stage: 'birthday', index: entry.index });
  await clickFirstVisible(page, continueSelectors, logs, '生日页继续按钮', entry, 15000);
  await page.waitForTimeout(2500);
  return true;
}

async function applyKiroCookieFlow(page, context, config, logs, entry) {
  const cookieAcceptSelectors = [
    'button:has-text("Accept")',
    'button:has-text("接受")',
    'button[id*="accept"]',
    'button[class*="accept"]'
  ];

  for (const selector of cookieAcceptSelectors) {
    try {
      const cookieButton = page.locator(selector).first();
      if (await cookieButton.isVisible({ timeout: 1200 })) {
        await cookieButton.click();
        logLine(logs, `[${entry.index}] 已处理 Cookie 弹窗: ${selector}`, { stage: 'cookie', index: entry.index });
        break;
      }
    } catch (_error) {}
  }

  let foundToken = null;
  let stableCount = 0;

  for (let sec = 0; sec < config.kiroFlow.maxWaitSeconds; sec += 1) {
    const cookies = await context.cookies();
    const hit = cookies.find((c) => c.name === config.kiroFlow.cookieName);
    if (hit?.value) {
      if (!foundToken) {
        foundToken = hit.value;
        logLine(logs, `[${entry.index}] 检测到 ${config.kiroFlow.cookieName}，开始稳定计时`, { stage: 'cookie', index: entry.index });
      }
      stableCount += 1;
      if (stableCount >= config.kiroFlow.stableSeconds) {
        entry.ssoCookieName = config.kiroFlow.cookieName;
        entry.ssoTokenPreview = `${foundToken.slice(0, 50)}...`;
        logLine(logs, `[${entry.index}] ${config.kiroFlow.cookieName} 已稳定 ${stableCount}s，判定授权完成`, { stage: 'cookie', index: entry.index });
        return;
      }
    } else {
      foundToken = null;
      stableCount = 0;
    }
    await page.waitForTimeout(1000);
  }

  logLine(logs, `[${entry.index}] 在等待窗口内未拿到稳定的 ${config.kiroFlow.cookieName}`, { stage: 'cookie', index: entry.index });
}

async function runKiroRegistration(page, context, config, account, logs, entry) {
  const recentHttpErrors = [];
  page.on('response', (response) => {
    const status = response.status();
    if (status >= 400) {
      const item = { status, url: response.url(), at: Date.now() };
      recentHttpErrors.push(item);
      if (recentHttpErrors.length > 8) recentHttpErrors.shift();
      if (status === 400) {
        logLine(logs, `[${entry.index}] 检测到页面请求返回 400: ${item.url}`, { stage: 'http-400', index: entry.index });
      }
    }
  });

  const customNameSelector = String(config?.selectors?.username || '').trim();
  const emailInputSelectors = [
    'input[placeholder="username@example.com"]',
    'input[placeholder="name@domain.com"]',
    'input[type="email"]',
    'input[name="email"]',
    'input[id*="email"]',
    'input[name*="email" i]',
    'input[id*="email" i]'
  ];
  const firstContinueSelectors = [
    'button[data-testid="signup-next-button"]',
    'button[data-testid="test-primary-button"]',
    'button:has-text("Continue")',
    'button:has-text("继续")'
  ];
  const nameInputSelectors = [
    ...(customNameSelector ? [customNameSelector] : []),
    'input[placeholder="Maria José Silva"]',
    'input[placeholder="Full name"]',
    'input[placeholder="Name"]',
    'input[placeholder*="姓名"]',
    'input[placeholder*="用户名"]',
    'input[placeholder*="名字"]',
    'input[placeholder*="全名"]',
    'input[autocomplete="name"]',
    'input[name="name"]',
    'input[name="username"]',
    'input[name="userName"]',
    'input[id*="name"]',
    'input[id*="username" i]',
    'input[aria-label*="name" i]',
    'input[aria-label*="姓名"]',
    'input[aria-label*="用户名"]',
    'input[name*="name" i]',
    'input[id*="name" i]',
    'input[data-testid*="name" i]',
    'input[data-testid*="username" i]'
  ];
  const codeInputSelectors = [
    'input[placeholder="6-digit"]',
    'input[aria-label*="Verification code" i]',
    'input[aria-label*="code" i]',
    'input[name*="verification" i]',
    'input[id*="verification" i]',
    'input[name*="code" i]',
    'input[id*="code" i]',
    'input[placeholder="6 位数"]',
    'input[inputmode="numeric"]',
    'input[autocomplete="one-time-code"]',
    'input[maxlength="6"]'
  ];
  const verifySelectors = [
    'button[data-testid="email-verification-verify-button"]',
    'button[data-testid="test-primary-button"]',
    'button:has-text("Continue")',
    'button:has-text("Verify")'
  ];
  const passwordInputSelectors = [
    'input[placeholder="Enter password"]',
    'input[placeholder="Create password"]',
    'input[placeholder="Password"]',
    'input[name="password"]',
    'input[id*="password"]',
    'input[type="password"]'
  ];
  const confirmPasswordSelectors = [
    'input[placeholder="Re-enter password"]',
    'input[placeholder="Confirm password"]',
    'input[placeholder="Confirm Password"]',
    'input[name="confirmPassword"]',
    'input[id*="confirm"]',
    'input[type="password"]:nth-of-type(2)'
  ];
  const authConfirmSelectors = [
    'button:has-text("Confirm and continue")',
    'button:has-text("确认并继续")',
    'button[data-testid="confirm-button"]',
    'button:has-text("Confirm")'
  ];
  const allowAccessSelectors = [
    'button:has-text("Allow access")',
    'button:has-text("允许访问")',
    'button[data-testid="allow-access-button"]',
    'button:has-text("Allow")'
  ];
  const flowSelectors = {
    emailInputSelectors,
    nameInputSelectors,
    codeInputSelectors,
    firstContinueSelectors
  };

  logLine(logs, `[${entry.index}] 进入 Kiro 注册页`, { stage: 'goto', index: entry.index });
  await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sendPagePreview(page, '已打开注册页', { stage: 'goto', index: entry.index });
  const providerSelected = await selectKiroBuilderId(page, config, logs, entry);
  if (providerSelected) {
    await selectAwsBuilderIdEmailPath(page, logs, entry, emailInputSelectors);
  } else {
    await selectAwsBuilderIdEmailPath(page, logs, entry, emailInputSelectors).catch(async (error) => {
      const emailReady = await waitForAnyVisible(page, emailInputSelectors, 5000);
      if (emailReady) {
        logLine(logs, `[${entry.index}] 页面已直接落在 AWS Builder ID 邮箱页，跳过前置选择`, { stage: 'aws-entry', index: entry.index });
        return;
      }
      throw error;
    });
  }

  const stateAfterEntry = await driveRegistrationByPageState(
    page,
    account,
    logs,
    entry,
    flowSelectors,
    recentHttpErrors,
    { timeout: 70000, reloadMax: config.retryMax }
  );

  if (stateAfterEntry === 'code') {
    await waitForVerificationCodePage(page, codeInputSelectors, account, logs, entry, firstContinueSelectors, {
      recentHttpErrors,
      reloadMax: config.retryMax
    });
    await sendPagePreview(page, '图4: 进入邮箱验证码页面', { stage: 'verify-code', index: entry.index });
    logLine(logs, `[${entry.index}] 图4: 已进入邮箱验证码页面，开始从邮箱获取 6 位验证码`, { stage: 'verify-code', index: entry.index });

    const codeResult = await waitMailboxCode({
      providerId: account.mailbox?.providerId,
      email: account.mailbox?.email,
      token: account.mailbox?.token,
      timeoutSec: 300,
      intervalMs: 3000
    });
    if (!codeResult?.ok || !codeResult.code) {
      throw new Error(codeResult?.message || '未获取到邮箱验证码');
    }

    logLine(logs, `[${entry.index}] 已获取验证码: ${codeResult.code}`, { stage: 'verify-code', index: entry.index });
    await fillFirstVisible(page, codeInputSelectors, codeResult.code, logs, '邮箱验证码', entry);
    await clickFirstVisible(page, verifySelectors, logs, '图4 验证码 Continue 按钮', entry, 20000);
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await sendPagePreview(page, '图4: 已提交邮箱验证码', { stage: 'verify-submit', index: entry.index });
    await waitForPasswordPage(page, passwordInputSelectors, logs, entry);
  } else if (stateAfterEntry !== 'password') {
    throw new Error(`主流程失败: 未知页面状态 ${stateAfterEntry}`);
  }

  await fillPasswordFieldsWithReloadRetry(page, passwordInputSelectors, confirmPasswordSelectors, account.password, logs, entry);
  await clickFirstVisible(page, verifySelectors, logs, '密码确认按钮', entry, 20000);
  await waitAfterPasswordSubmit(page, passwordInputSelectors, authConfirmSelectors, allowAccessSelectors, recentHttpErrors, logs, entry, 45000, 0, config.retryMax);
  await sendPagePreview(page, '已提交密码', { stage: 'password-submit', index: entry.index });

  const authButton = await waitForAnyVisible(page, authConfirmSelectors, 20000);
  if (authButton) {
    await authButton.locator.click({ timeout: 10000 });
    logLine(logs, `[${entry.index}] 已点击授权确认按钮`, { stage: 'auth-confirm', index: entry.index });
    await sendPagePreview(page, '已点击授权确认', { stage: 'auth-confirm', index: entry.index });
  }

  const allowButton = await waitForAnyVisible(page, allowAccessSelectors, 20000);
  if (allowButton) {
    await allowButton.locator.click({ timeout: 10000 });
    logLine(logs, `[${entry.index}] 已点击 Allow access 按钮`, { stage: 'allow-access', index: entry.index });
    await sendPagePreview(page, '已点击 Allow access', { stage: 'allow-access', index: entry.index });
  }

  if (config.kiroFlow.enabled) {
    await applyKiroCookieFlow(page, context, config, logs, entry);
  } else {
    await page.waitForTimeout(3000);
  }
}

async function runRegisterBatch(payload) {
  const { chromium } = require('playwright');
  const logs = [];
  const results = [];
  const providerId = String(payload?.providerId || 'kiro').trim();
  const rawPassword = String(payload?.password || '').trim();
  const fingerprintEnabled = Boolean(payload?.fingerprintEnabled);
  const requestedFingerprintType = String(payload?.fingerprintType || 'random').trim() || 'random';

  sendAutomationProgress({ type: 'reset' });

  const config = {
    providerId,
    url: String(payload?.url || '').trim(),
    usernamePrefix: String(payload?.usernamePrefix || 'user_').trim(),
    fullName: String(payload?.fullName || '').trim(),
    emailDomain: String(payload?.emailDomain || 'example.com').trim(),
    password: rawPassword && rawPassword !== 'admin123456aA!' ? rawPassword : generateDefaultPassword(),
    birthYear: Math.max(1900, Math.min(Number(payload?.birthYear || 1998), 2020)),
    birthMonth: Math.max(1, Math.min(Number(payload?.birthMonth || 1), 12)),
    birthDay: Math.max(1, Math.min(Number(payload?.birthDay || 1), 31)),
    count: Math.max(1, Math.min(Number(payload?.count || 1), 50)),
    headless: Boolean(payload?.headless),
    stopOnError: Boolean(payload?.stopOnError),
    fingerprintEnabled,
    fingerprintType: fingerprintEnabled ? requestedFingerprintType : 'none',
    retryMax: Math.max(0, Math.min(Number(payload?.retryMax ?? 3), 10)),
    mailbox: {
      autoCreate: Boolean(payload?.mailbox?.autoCreate),
      providerId: String(payload?.mailbox?.providerId || 'tempmail_lol').trim() || 'tempmail_lol'
    },
    kiroFlow: {
      enabled: Boolean(payload?.kiroFlow?.enabled),
      cookieName: String(payload?.kiroFlow?.cookieName || 'x-amz-sso_authn').trim() || 'x-amz-sso_authn',
      stableSeconds: Math.max(3, Math.min(Number(payload?.kiroFlow?.stableSeconds || 15), 60)),
      maxWaitSeconds: Math.max(10, Math.min(Number(payload?.kiroFlow?.maxWaitSeconds || 90), 300))
    },
    selectors: {
      entry: String(payload?.selectors?.entry || '').trim(),
      username: String(payload?.selectors?.username || '').trim(),
      email: String(payload?.selectors?.email || '').trim(),
      password: String(payload?.selectors?.password || '').trim(),
      confirmPassword: String(payload?.selectors?.confirmPassword || '').trim(),
      submit: String(payload?.selectors?.submit || '').trim(),
      success: String(payload?.selectors?.success || '').trim()
    }
  };

  if (!config.url) throw new Error('请先填写注册页面 URL');
  if (config.providerId !== 'kiro' && !config.selectors.submit) throw new Error('请先填写提交按钮选择器');

  logLine(logs, `启动任务: ${config.url}`, { stage: 'init' });
  logLine(logs, `计划注册数量: ${config.count}`, { stage: 'init' });
  logLine(logs, `指纹类型: ${config.fingerprintType}`, { stage: 'init' });
  logLine(logs, `失败刷新重试次数: ${config.retryMax}`, { stage: 'init' });
  logLine(logs, `账号类型: ${config.providerId}`, { stage: 'init' });
  if (config.mailbox.autoCreate) {
    logLine(logs, `邮箱服务: ${config.mailbox.providerId}（自动创建）`, { stage: 'init' });
  }
  logLine(logs, `默认密码: ${config.password}`, { stage: 'init' });

  const browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.headless ? 0 : 80
  });

  try {
    for (let i = 0; i < config.count; i += 1) {
      let mailboxResult = null;
      if (config.mailbox.autoCreate) {
        mailboxResult = await createMailbox({ providerId: config.mailbox.providerId });
        logLine(logs, `[${i + 1}/${config.count}] 已创建临时邮箱: ${mailboxResult.email}`, { stage: 'mailbox', index: i + 1 });
      }

    const account = buildAccount(config, i, mailboxResult);
    const entry = { index: i + 1, account, status: 'pending', error: '' };
    let page = null;

      logLine(logs, `[${entry.index}/${config.count}] 开始: ${account.email}`, { stage: 'start', index: entry.index });

      try {
        const fingerprintProfile = buildFingerprintProfile(config.fingerprintType, browser.version());
        const contextOptions = buildContextOptionsFromProfile(fingerprintProfile);
        const context = await browser.newContext(contextOptions);
        if (fingerprintProfile) {
          const script = fingerprintInjector.generateInjectionCode(fingerprintProfile);
          await context.addInitScript({ content: script });
          logLine(logs, `[${entry.index}/${config.count}] 指纹已注入: ${fingerprintProfile.os} / ${fingerprintProfile.navigator.userAgent}`, {
            stage: 'fingerprint',
            index: entry.index
          });
        }
        page = await context.newPage();

        if (config.providerId === 'kiro') {
          await runKiroRegistration(page, context, config, account, logs, entry);
        } else {
          await page.goto(config.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

          if (config.selectors.username) await page.fill(config.selectors.username, account.username, { timeout: 15000 });
          if (config.selectors.email) await page.fill(config.selectors.email, account.email, { timeout: 15000 });
          if (config.selectors.password) await page.fill(config.selectors.password, account.password, { timeout: 15000 });
          if (config.selectors.confirmPassword) await page.fill(config.selectors.confirmPassword, account.password, { timeout: 15000 });

          await page.click(config.selectors.submit, { timeout: 15000 });

          if (config.selectors.success) {
            await page.waitForSelector(config.selectors.success, { timeout: 15000 });
          } else {
            await page.waitForTimeout(2000);
          }
        }

        await context.close();

        entry.status = 'success';
        const storedRecord = await appendStoredAccount(config.providerId, entry);
        entry.storedAccountId = storedRecord.id;
        entry.storedAccountPath = accountsFilePath();
        logLine(logs, `[${entry.index}/${config.count}] 已写入本地账号文件: ${entry.storedAccountPath}`, { stage: 'persist', index: entry.index });
        logLine(logs, `[${entry.index}/${config.count}] 成功: ${account.email}`, { stage: 'success', index: entry.index });
      } catch (error) {
        entry.status = 'failed';
        entry.error = error instanceof Error ? error.message : String(error);
        logLine(logs, `[${entry.index}/${config.count}] 失败: ${entry.error}`, { stage: 'failed', index: entry.index });
        try {
          if (page) {
            await sendPagePreview(page, '失败现场', { stage: 'failed', index: entry.index });
          }
        } catch (_error) {}

        if (config.stopOnError) {
          results.push(entry);
          break;
        }
      }

      results.push(entry);
    }
  } finally {
    await browser.close();
  }

  return { ok: true, logs, results };
}

async function createMailbox(payload) {
  const providerId = String(payload?.providerId || 'tempmail_lol');
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (!provider) throw new Error('不支持的邮箱服务');

  const apiKey = process.env.YYDS_MAIL_API_KEY || process.env.MALIAPI_215_API_KEY;

  if (providerId === 'mali215') {
    if (!apiKey) throw new Error('缺少 YYDS_MAIL_API_KEY（或 MALIAPI_215_API_KEY）');

    const address = randomString(8);
    const domain = '0m0.abrdns.com';
    const resp = await fetch('https://maliapi.215.im/v1/accounts', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ address, domain })
    });

    if (!resp.ok) throw new Error(`215.im 创建失败: ${resp.status}`);
    const data = await resp.json();
    if (!data?.success || !data?.data?.address || !data?.data?.token) {
      throw new Error('215.im 返回格式异常');
    }
    return { providerId, email: data.data.address, token: data.data.token, password: generateDefaultPassword() };
  }

  if (providerId === 'tempmail_lol') {
    const resp = await fetch('https://api.tempmail.lol/v2/inbox/create');
    if (!resp.ok) throw new Error(`tempmail.lol 创建失败: ${resp.status}`);
    const data = await resp.json();
    return { providerId, email: data.address, token: data.token, password: generateDefaultPassword() };
  }

  if (providerId === 'mail_tm') {
    const domainsResp = await fetch('https://api.mail.tm/domains');
    if (!domainsResp.ok) throw new Error(`mail.tm 获取域名失败: ${domainsResp.status}`);
    const domainData = await domainsResp.json();
    const firstDomain = domainData?.['hydra:member']?.[0]?.domain;
    if (!firstDomain) throw new Error('mail.tm 无可用域名');

    const email = `${randomString(10)}@${firstDomain}`;
    const password = `${randomString(8)}A1!`;
    const createResp = await fetch('https://api.mail.tm/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: email, password })
    });
    if (!createResp.ok) throw new Error(`mail.tm 账号创建失败: ${createResp.status}`);

    const tokenResp = await fetch('https://api.mail.tm/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: email, password })
    });
    if (!tokenResp.ok) throw new Error(`mail.tm token 获取失败: ${tokenResp.status}`);
    const tokenData = await tokenResp.json();

    return { providerId, email, token: tokenData.token, password };
  }

  if (providerId === '1secmail') {
    const resp = await fetch('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
    if (!resp.ok) throw new Error(`1secmail 创建失败: ${resp.status}`);
    const data = await resp.json();
    const email = data?.[0];
    if (!email) throw new Error('1secmail 返回邮箱为空');
    return { providerId, email, token: email, password: generateDefaultPassword() };
  }

  if (providerId === 'tempmail_plus') {
    const resp = await fetch('https://tempmail.plus/api/mails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!resp.ok) throw new Error(`tempmail.plus 创建失败: ${resp.status}`);
    const data = await resp.json();
    if (!data?.email) throw new Error('tempmail.plus 返回邮箱为空');
    return { providerId, email: data.email, token: data.token || data.email, password: generateDefaultPassword() };
  }

  if (providerId === 'guerrilla') {
    const resp = await fetch('https://api.guerrillamail.com/ajax.php?f=get_email_address');
    if (!resp.ok) throw new Error(`guerrillamail 创建失败: ${resp.status}`);
    const data = await resp.json();
    if (!data?.email_addr || !data?.sid_token) throw new Error('guerrillamail 返回数据异常');
    return { providerId, email: data.email_addr, token: data.sid_token, password: generateDefaultPassword() };
  }

  throw new Error('未实现的邮箱服务');
}

async function fetchMessages(providerId, email, token) {
  if (providerId === 'mali215') {
    const resp = await fetch(`https://maliapi.215.im/v1/messages?address=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const list = data?.data?.messages || [];
    return list.map((m) => ({
      from: m?.from?.address || '',
      subject: m?.subject || '',
      body: m?.text || '',
      html: Array.isArray(m?.html) ? m.html.join('') : (m?.html || '')
    }));
  }

  if (providerId === 'mail_tm') {
    const resp = await fetch('https://api.mail.tm/messages', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data?.['hydra:member'] || []).map((m) => ({
      from: m?.from?.address || '',
      subject: m?.subject || '',
      body: m?.intro || '',
      html: m?.intro || ''
    }));
  }

  if (providerId === '1secmail') {
    const [login, domain] = String(email).split('@');
    const listResp = await fetch(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domain}`);
    if (!listResp.ok) return [];
    const list = await listResp.json();
    const messages = [];

    for (const msg of list || []) {
      const detailResp = await fetch(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domain}&id=${msg.id}`);
      if (!detailResp.ok) continue;
      const detail = await detailResp.json();
      messages.push({
        from: msg.from || '',
        subject: msg.subject || '',
        body: detail?.textBody || detail?.body || '',
        html: detail?.htmlBody || ''
      });
    }
    return messages;
  }

  if (providerId === 'tempmail_plus') {
    const resp = await fetch(`https://tempmail.plus/api/mails/${encodeURIComponent(email)}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data?.mails || []).map((m) => ({
      from: m?.from || '',
      subject: m?.subject || '',
      body: m?.body || '',
      html: m?.html || ''
    }));
  }

  if (providerId === 'guerrilla') {
    const resp = await fetch(`https://api.guerrillamail.com/ajax.php?f=get_email_list&sid_token=${token}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    const messages = [];
    for (const msg of data?.list || []) {
      messages.push({
        from: msg?.mail_from || '',
        subject: msg?.mail_subject || '',
        body: msg?.mail_excerpt || '',
        html: ''
      });
    }
    return messages;
  }

  const resp = await fetch(`https://api.tempmail.lol/v2/inbox?token=${encodeURIComponent(token)}`);
  if (!resp.ok) return [];
  const data = await resp.json();
  return (data?.emails || []).map((m) => ({
    from: m?.from || '',
    subject: m?.subject || '',
    body: m?.body || '',
    html: m?.html || ''
  }));
}

async function waitMailboxCode(payload) {
  const providerId = String(payload?.providerId || 'tempmail_lol');
  const email = String(payload?.email || '');
  const token = String(payload?.token || '');
  const timeoutSec = Math.max(10, Math.min(Number(payload?.timeoutSec || 120), 600));
  const intervalMs = Math.max(2000, Math.min(Number(payload?.intervalMs || 3000), 10000));

  if (!email || !token) throw new Error('缺少 email 或 token');

  const startAt = Date.now();
  while (Date.now() - startAt < timeoutSec * 1000) {
    const messages = await fetchMessages(providerId, email, token);
    for (const msg of messages) {
      const raw = `${msg.subject || ''}\n${msg.body || ''}\n${msg.html || ''}`;
      const code = extractCode(htmlToText(raw));
      if (code) {
        return {
          ok: true,
          code,
          matchedMessage: {
            from: msg.from,
            subject: msg.subject
          }
        };
      }
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { ok: false, code: null, message: '等待超时，未找到验证码' };
}

app.whenReady().then(() => {
  ipcMain.handle('automation:register-batch', async (_event, payload) => runRegisterBatch(payload));
  ipcMain.handle('automation:launch-kiro-client', async (_event, payload) => launchKiroClient(payload));
  ipcMain.handle('automation:capture-kiro-web-account', async (_event, payload) => captureKiroWebAccount(payload));
  ipcMain.handle('mailbox:list-providers', async () => PROVIDERS);
  ipcMain.handle('mailbox:create', async (_event, payload) => createMailbox(payload));
  ipcMain.handle('mailbox:wait-code', async (_event, payload) => waitMailboxCode(payload));
  ipcMain.handle('quota:getQuota', async (_event, params) => {
    try {
      const { providerId, accountId } = params || {};
      
      if (!providerId || !accountId) {
        throw new Error('缺少必需参数: providerId 和 accountId');
      }
      
      // 读取账号信息
      const accounts = await readStoredAccounts();
      const account = accounts.find(a => a.id === accountId);
      
      if (!account) {
        throw new Error('账号不存在');
      }
      
      // 如果有 webProfilePath 或 storageStatePath，使用 Playwright 拦截 API 获取额度
      const profilePath = account.webProfilePath || kiroWebProfilePath(accountId);
      const storageStatePath = account.storageStatePath || kiroStorageStatePath(accountId);
      
      // 检查是否有可用的登录状态
      const hasStorageState = await pathExists(storageStatePath);
      const hasProfile = await pathExists(profilePath);
      
      if (hasStorageState || hasProfile) {
        const { chromium } = require('playwright');
        
        let context;
        try {
          // 使用持久化上下文，它会自动保存和恢复状态
          context = await chromium.launchPersistentContext(
            profilePath,
            {
              headless: true,
              viewport: { width: 1280, height: 820 }
            }
          );
          
          let quotaData = { quotaUsed: null, quotaTotal: null, availableModels: [] };
          
          // 监听 API 响应
          context.on('response', async (response) => {
            const url = response.url();
            if (!isInterestingKiroApi(url)) return;
            
            const contentType = response.headers()['content-type'] || '';
            if (!contentType.includes('json')) return;
            
            try {
              const json = await response.json();
              const extracted = extractUsageAndModels(json);
              if (extracted.quotaUsed !== null) quotaData.quotaUsed = extracted.quotaUsed;
              if (extracted.quotaTotal !== null) quotaData.quotaTotal = extracted.quotaTotal;
              if (extracted.availableModels.length > 0) quotaData.availableModels = extracted.availableModels;
            } catch (_e) {}
          });
          
          // 打开 Kiro 页面触发 API 请求
          const page = context.pages()[0] || await context.newPage();
          await page.goto('https://app.kiro.dev', { waitUntil: 'networkidle', timeout: 30000 });
          
          // 等待 API 请求完成
          await page.waitForTimeout(5000);
          
          // 如果没有拦截到额度数据，尝试刷新页面再试一次
          if (quotaData.quotaUsed === null && quotaData.quotaTotal === null) {
            await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
            await page.waitForTimeout(3000);
          }
          
          await context.close();
          
          if (quotaData.quotaUsed !== null || quotaData.quotaTotal !== null) {
            // 更新账号缓存
            await updateAccountQuota(accountId, quotaData);
            
            return {
              quotaUsed: quotaData.quotaUsed || 0,
              quotaTotal: quotaData.quotaTotal || 0,
              availableModels: quotaData.availableModels
            };
          }
        } catch (err) {
          if (context) {
            try { await context.close(); } catch (_e) {}
          }
          console.error('[quota:getQuota] Playwright error:', err.message);
        }
      }
      
      // 降级：返回缓存的数据
      return {
        quotaUsed: account.quotaUsed || 0,
        quotaTotal: account.quotaTotal || 0,
        availableModels: account.availableModels || []
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[quota:getQuota] Error:', errorMessage);
      throw new Error(`获取额度信息失败: ${errorMessage}`);
    }
  });

  // ─── API Reverse Proxy IPC Handlers ───

  ipcMain.handle('proxy:getStatus', async () => {
    try {
      const status = getProxyStatus ? getProxyStatus() : { running: false };
      return { ok: true, data: status };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('proxy:getConfig', async () => {
    try {
      const proxyPort = parseInt(process.env.PROXY_PORT || '11434', 10);
      return { ok: true, data: { host: '127.0.0.1', port: proxyPort } };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // 缓存 providers 数据（由前端通过 proxy:setProviders 传入）
  let cachedProviders = [];

  ipcMain.handle('proxy:getAccounts', async () => {
    try {
      const accounts = await readStoredAccounts();
      const validAccounts = accounts.filter(a =>
        a.availableModels && a.availableModels.length > 0
      );
      // 同步到 proxy-server
      try {
        const proxyServer = require('./proxy-server.cjs');
        proxyServer.setAccounts({ accounts: validAccounts, providers: cachedProviders });
      } catch (_e) {}
      return { ok: true, data: { accounts: validAccounts, providers: cachedProviders } };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('proxy:setProviders', async (_event, providers) => {
    try {
      cachedProviders = Array.isArray(providers) ? providers : [];
      // 同步到 proxy-server
      try {
        const proxyServer = require('./proxy-server.cjs');
        const accounts = await readStoredAccounts();
        const validAccounts = accounts.filter(a =>
          a.availableModels && a.availableModels.length > 0
        );
        proxyServer.setAccounts({ accounts: validAccounts, providers: cachedProviders });
      } catch (_e) {}
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('proxy:start', async () => {
    try {
      const proxyPort = parseInt(process.env.PROXY_PORT || '11434', 10);
      setProfilePathResolver((accountId) => kiroWebProfilePath(accountId));
      await startProxyServer({ port: proxyPort });
      console.log(`[main] API reverse proxy server started on http://127.0.0.1:${proxyPort}`);
      return { ok: true };
    } catch (err) {
      console.error('[main] Failed to start proxy server:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('proxy:stop', async () => {
    try {
      await stopProxyServer();
      console.log('[main] Proxy server stopped');
      return { ok: true };
    } catch (err) {
      console.error('[main] Error stopping proxy server:', err.message);
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('proxy:updateConfig', async (_event, cfg) => {
    try {
      if (cfg && typeof cfg.port === 'number') {
        process.env.PROXY_PORT = String(cfg.port);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', async () => {
  // Shutdown proxy server gracefully
  try {
    await shutdownProxySessions();
    await stopProxyServer();
    console.log('[main] Proxy server stopped');
  } catch (err) {
    console.error('[main] Error stopping proxy server:', err.message);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
