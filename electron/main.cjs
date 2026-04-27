const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { FingerprintGenerator } = require('./fingerprint/generator.cjs');
const { FingerprintInjector } = require('./fingerprint/injector.cjs');
const { ConsistencyValidator } = require('./fingerprint/validator.cjs');

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

function accountsFilePath() {
  return path.join(app.getPath('userData'), 'accounts.json');
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

function generateDefaultPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const all = `${upper}${lower}${digits}`;
  const pick = (chars) => chars[Math.floor(Math.random() * chars.length)];
  const rest = Array.from({ length: 9 }, () => pick(all));
  return [pick(upper), pick(lower), pick(digits), ...rest].sort(() => Math.random() - 0.5).join('');
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

function buildFingerprintProfile(type) {
  if (!type || type === 'none') return null;

  const forceOSMap = {
    windows_chrome: 'Windows',
    mac_chrome: 'macOS',
    linux_chrome: 'Linux'
  };

  const forceOS = type === 'random' ? undefined : forceOSMap[type];
  const profile = fingerprintGenerator.generate({ forceOS });
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
  const fallbackNames = ['Alex Chen', 'Mason Lee', 'Ryan Smith', 'Daniel Wu', 'Evan Taylor'];
  const fullName = String(baseConfig.fullName || fallbackNames[idx % fallbackNames.length]).trim();
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
  const birthdayMarkers = [
    'text=/生日|出生日期|出生年月|Birth date|Birthday|Date of birth/i',
    'input[name*="birth" i]',
    'input[id*="birth" i]',
    'select[name*="birth" i]',
    'select[id*="birth" i]'
  ];

  const marker = await waitForAnyVisible(page, birthdayMarkers, 4000);
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
    'input[placeholder="Maria José Silva"]',
    'input[placeholder="Full name"]',
    'input[placeholder="Name"]',
    'input[autocomplete="name"]',
    'input[name="name"]',
    'input[id*="name"]',
    'input[name*="name" i]',
    'input[id*="name" i]'
  ];
  const codeInputSelectors = [
    'input[placeholder="6-digit"]',
    'input[aria-label*="Verification code" i]',
    'input[name*="verification" i]',
    'input[id*="verification" i]',
    'input[name*="code" i]',
    'input[id*="code" i]',
    'input[placeholder="6 位数"]',
    'input[inputmode="numeric"]',
    'input[class*="awsui_input"][type="text"]'
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

  await fillFirstVisible(page, emailInputSelectors, account.email, logs, '邮箱', entry);
  await sendPagePreview(page, '图2: 已填写邮箱', { stage: 'email', index: entry.index });
  await clickFirstVisible(page, firstContinueSelectors, logs, '图2 继续按钮', entry);
  await page.waitForTimeout(2000);
  await sendPagePreview(page, '点击第一步继续后', { stage: 'continue-1', index: entry.index });

  const passwordPage = await waitForAnyVisible(page, ['input[placeholder="Enter password"]'], 4000);
  if (passwordPage) {
    logLine(logs, `[${entry.index}] 页面进入已有账号登录分支，当前流程按注册账号设计，停止继续`, { stage: 'login-branch', index: entry.index });
    throw new Error('当前邮箱已进入登录分支，请更换邮箱后重试');
  }

  await fillFirstVisible(page, nameInputSelectors, account.fullName, logs, '姓名', entry);
  await sendPagePreview(page, '图3: 已填写姓名', { stage: 'name', index: entry.index });
  logLine(logs, `[${entry.index}] 图3: 姓名填写完成，等待 5 秒后再点击 Continue`, { stage: 'name', index: entry.index });
  await page.waitForTimeout(5000);
  await clickFirstVisible(page, firstContinueSelectors, logs, '图3 继续按钮', entry);
  await page.waitForTimeout(2500);
  await handleOptionalBirthdayStep(page, account, logs, entry, firstContinueSelectors);
  await sendPagePreview(page, '图4: 进入邮箱验证码页面', { stage: 'verify-code', index: entry.index });

  await waitForAnyVisible(page, codeInputSelectors, 30000);
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
  await sendPagePreview(page, '图4: 已提交邮箱验证码', { stage: 'verify-submit', index: entry.index });

  await waitForAnyVisible(page, passwordInputSelectors, 45000);
  await fillFirstVisible(page, passwordInputSelectors, account.password, logs, '密码', entry);
  await fillFirstVisible(page, confirmPasswordSelectors, account.password, logs, '确认密码', entry);
  await clickFirstVisible(page, verifySelectors, logs, '密码确认按钮', entry, 20000);
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

  sendAutomationProgress({ type: 'reset' });

  const config = {
    providerId,
    url: String(payload?.url || '').trim(),
    usernamePrefix: String(payload?.usernamePrefix || 'user_').trim(),
    fullName: String(payload?.fullName || '').trim(),
    emailDomain: String(payload?.emailDomain || 'example.com').trim(),
    password: String(payload?.password || '').trim() || generateDefaultPassword(),
    birthYear: Math.max(1900, Math.min(Number(payload?.birthYear || 1998), 2020)),
    birthMonth: Math.max(1, Math.min(Number(payload?.birthMonth || 1), 12)),
    birthDay: Math.max(1, Math.min(Number(payload?.birthDay || 1), 31)),
    count: Math.max(1, Math.min(Number(payload?.count || 1), 50)),
    headless: Boolean(payload?.headless),
    stopOnError: Boolean(payload?.stopOnError),
    fingerprintType: String(payload?.fingerprintType || 'none'),
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
        const fingerprintProfile = buildFingerprintProfile(config.fingerprintType);
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
  ipcMain.handle('mailbox:list-providers', async () => PROVIDERS);
  ipcMain.handle('mailbox:create', async (_event, payload) => createMailbox(payload));
  ipcMain.handle('mailbox:wait-code', async (_event, payload) => waitMailboxCode(payload));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
