import { defineStore } from 'pinia';

const STORAGE_KEY = 'all2api-account-center-v1';

function nowText() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

function createDefaults() {
  return {
    providers: [
      {
        id: 'kiro',
        name: 'Kiro 账号',
        intro: 'AWS Builder ID / Kiro 相关注册与切换链路',
        maxManage: 300,
        proxyEnabled: true
      },
      {
        id: 'codex',
        name: 'Codex 账号',
        intro: '通用 AI 工具账号管理占位',
        maxManage: 200,
        proxyEnabled: true
      },
      {
        id: 'cursor',
        name: 'Cursor 账号',
        intro: 'Cursor 类账号流程占位',
        maxManage: 200,
        proxyEnabled: true
      }
    ],
    accountsByProvider: {
      kiro: [],
      codex: [],
      cursor: []
    },
    settingsByProvider: {
      kiro: {
        url: 'https://app.kiro.dev',
        usernamePrefix: 'kiro_',
        fullName: '',
        password: '',
        birthYear: 1998,
        birthMonth: 1,
        birthDay: 1,
        headless: false,
        stopOnError: true,
        fingerprintEnabled: false,
        fingerprintType: 'random',
        retryMax: 3,
        mailbox: {
          autoCreate: true,
          providerId: 'tempmail_lol'
        },
        kiroFlow: {
          enabled: true,
          cookieName: 'x-amz-sso_authn',
          stableSeconds: 15,
          maxWaitSeconds: 90
        },
        kiroClient: {
          executablePath: '',
          workspacePath: ''
        },
        selectors: {
          entry: '',
          username: '',
          email: '',
          password: '',
          confirmPassword: '',
          submit: '',
          success: ''
        }
      },
      codex: {
        usernamePrefix: 'codex_',
        emailDomain: 'example.com'
      },
      cursor: {
        usernamePrefix: 'cursor_',
        emailDomain: 'example.com'
      }
    }
  };
}

function mergeProviderSettings(base, incoming) {
  return {
    ...base,
    ...incoming,
    mailbox: {
      ...(base?.mailbox || {}),
      ...(incoming?.mailbox || {})
    },
    kiroFlow: {
      ...(base?.kiroFlow || {}),
      ...(incoming?.kiroFlow || {})
    },
    kiroClient: {
      ...(base?.kiroClient || {}),
      ...(incoming?.kiroClient || {})
    },
    selectors: {
      ...(base?.selectors || {}),
      ...(incoming?.selectors || {})
    }
  };
}

function mergeProviders(defaultProviders, incomingProviders) {
  if (!Array.isArray(incomingProviders) || incomingProviders.length === 0) {
    return defaultProviders;
  }

  const incomingMap = new Map(incomingProviders.map((item) => [item.id, item]));
  return defaultProviders.map((item) => ({
    ...item,
    ...(incomingMap.get(item.id) || {})
  }));
}

function mergeAccountsByProvider(defaultAccountsByProvider, incomingAccountsByProvider) {
  return {
    ...defaultAccountsByProvider,
    ...(incomingAccountsByProvider || {})
  };
}

export const useAccountCenterStore = defineStore('account-center', {
  state: () => ({
    ...createDefaults(),
    // 性能优化：额度信息缓存
    quotaCache: {},
    // 性能优化：防抖定时器
    persistTimer: null
  }),
  getters: {
    providerById: (state) => (id) => state.providers.find((p) => p.id === id),
    providerStats: (state) => (id) => {
      const provider = state.providers.find((p) => p.id === id);
      const list = state.accountsByProvider[id] || [];
      const successCount = list.filter((a) => a.status === 'success').length;
      return {
        total: list.length,
        successCount,
        maxManage: provider?.maxManage || 0
      };
    }
  },
  actions: {
    load() {
      try {
        const defaults = createDefaults();
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return;

        this.providers = mergeProviders(defaults.providers, parsed.providers);
        this.accountsByProvider = mergeAccountsByProvider(defaults.accountsByProvider, parsed.accountsByProvider);
        this.settingsByProvider = {
          ...defaults.settingsByProvider,
          ...(parsed.settingsByProvider || {})
        };
        this.settingsByProvider.kiro = mergeProviderSettings(defaults.settingsByProvider.kiro, this.settingsByProvider.kiro);
        if (this.settingsByProvider.kiro.url === 'https://view.awsapps.com/start') {
          this.settingsByProvider.kiro.url = defaults.settingsByProvider.kiro.url;
        }
        this.settingsByProvider.kiro.fingerprintEnabled = Boolean(this.settingsByProvider.kiro.fingerprintEnabled);
        if (!this.settingsByProvider.kiro.fingerprintType || this.settingsByProvider.kiro.fingerprintType === 'none') {
          this.settingsByProvider.kiro.fingerprintType = defaults.settingsByProvider.kiro.fingerprintType;
        }
        this.settingsByProvider.kiro.retryMax = Number(this.settingsByProvider.kiro.retryMax || defaults.settingsByProvider.kiro.retryMax);
        this.settingsByProvider.codex = mergeProviderSettings(defaults.settingsByProvider.codex, this.settingsByProvider.codex);
        this.settingsByProvider.cursor = mergeProviderSettings(defaults.settingsByProvider.cursor, this.settingsByProvider.cursor);
      } catch (_e) {}
    },
    persist() {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          providers: this.providers,
          accountsByProvider: this.accountsByProvider,
          settingsByProvider: this.settingsByProvider
        })
      );
    },
    // 性能优化：防抖持久化（批量更新时减少 localStorage 写入）
    persistDebounced() {
      if (this.persistTimer) {
        clearTimeout(this.persistTimer);
      }
      this.persistTimer = setTimeout(() => {
        this.persist();
        this.persistTimer = null;
      }, 300);
    },
    addAccount(providerId, payload) {
      const list = this.accountsByProvider[providerId] || [];
      const next = {
        id: payload.id || `${providerId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: nowText(),
        status: payload.status || 'success',
        email: payload.email || '',
        username: payload.username || '',
        password: payload.password || '',
        localFilePath: payload.localFilePath || '',
        note: payload.note || '',
        ssoTokenPreview: payload.ssoTokenPreview || '',
        kiroProfilePath: payload.kiroProfilePath || '',
        kiroClientBoundAt: payload.kiroClientBoundAt || '',
        kiroClientLastLaunchAt: payload.kiroClientLastLaunchAt || '',
        kiroExecutablePath: payload.kiroExecutablePath || '',
        authMode: payload.authMode || '',
        webProfilePath: payload.webProfilePath || '',
        storageStatePath: payload.storageStatePath || '',
        ssoCookieName: payload.ssoCookieName || '',
        quotaUsed: Number(payload.quotaUsed || 0),
        quotaTotal: Number(payload.quotaTotal || 0),
        availableModels: Array.isArray(payload.availableModels) ? payload.availableModels : [],
        discoveredApis: Array.isArray(payload.discoveredApis) ? payload.discoveredApis : [],
        lastLoginUrl: payload.lastLoginUrl || '',
        addedAt: payload.addedAt || ''
      };
      this.accountsByProvider[providerId] = [next, ...list];
      this.persistDebounced(); // 性能优化：使用防抖持久化
      return next;
    },
    updateAccount(providerId, accountId, patch) {
      const list = this.accountsByProvider[providerId] || [];
      let updated = null;
      this.accountsByProvider[providerId] = list.map((item) => {
        if (item.id !== accountId) return item;
        updated = {
          ...item,
          ...patch
        };
        return updated;
      });
      this.persistDebounced(); // 性能优化：使用防抖持久化
      return updated;
    },
    setProxyConfig(providerId, accountId, config) {
      return this.updateAccount(providerId, accountId, { proxyConfig: config });
    },
    getActiveAccount(providerId) {
      const list = this.accountsByProvider[providerId] || [];
      const now = new Date();
      const activeThresholdMinutes = 30;
      
      // Filter accounts that were launched within the last 30 minutes
      const activeAccounts = list.filter((account) => {
        if (!account.kiroClientLastLaunchAt) return false;
        
        try {
          const lastLaunch = new Date(account.kiroClientLastLaunchAt);
          // Check for invalid dates
          if (isNaN(lastLaunch.getTime())) return false;
          
          const diffMinutes = (now - lastLaunch) / 1000 / 60;
          return diffMinutes >= 0 && diffMinutes <= activeThresholdMinutes;
        } catch (_e) {
          return false;
        }
      });
      
      // If no active accounts, return null
      if (activeAccounts.length === 0) return null;
      
      // If multiple active accounts, return the one with the most recent launch time
      return activeAccounts.reduce((latest, current) => {
        const latestTime = new Date(latest.kiroClientLastLaunchAt).getTime();
        const currentTime = new Date(current.kiroClientLastLaunchAt).getTime();
        return currentTime > latestTime ? current : latest;
      });
    },
    setSettings(providerId, patch) {
      this.settingsByProvider[providerId] = mergeProviderSettings(this.settingsByProvider[providerId] || {}, patch);
      this.persist();
    },
    // 性能优化：获取缓存的额度信息（5分钟缓存）
    getCachedQuota(providerId, accountId) {
      const cacheKey = `${providerId}_${accountId}`;
      const cached = this.quotaCache[cacheKey];
      
      if (!cached) return null;
      
      const now = Date.now();
      const cacheAge = now - cached.timestamp;
      const fiveMinutes = 5 * 60 * 1000;
      
      // 缓存超过5分钟则失效
      if (cacheAge > fiveMinutes) {
        delete this.quotaCache[cacheKey];
        return null;
      }
      
      return cached.data;
    },
    // 性能优化：设置额度信息缓存
    setCachedQuota(providerId, accountId, quotaData) {
      const cacheKey = `${providerId}_${accountId}`;
      this.quotaCache[cacheKey] = {
        data: quotaData,
        timestamp: Date.now()
      };
    },
    // 性能优化：清除过期的额度缓存
    clearExpiredQuotaCache() {
      const now = Date.now();
      const fiveMinutes = 5 * 60 * 1000;
      
      Object.keys(this.quotaCache).forEach(key => {
        const cached = this.quotaCache[key];
        if (now - cached.timestamp > fiveMinutes) {
          delete this.quotaCache[key];
        }
      });
    },
    // 切换 provider 的 API 反代开关
    toggleProviderProxy(providerId) {
      const provider = this.providers.find((p) => p.id === providerId);
      if (!provider) return;
      provider.proxyEnabled = !provider.proxyEnabled;
      this.persist();
    },
    // 刷新账号额度信息
    async refreshQuota(providerId, accountId) {
      // 1. 构建缓存键
      const cacheKey = `${providerId}_${accountId}`;
      
      // 2. 在请求前清除缓存
      if (this.quotaCache[cacheKey]) {
        delete this.quotaCache[cacheKey];
      }
      
      // 3. 验证 IPC 接口可用性
      if (!window.desktop?.quota?.getQuota) {
        throw new Error('额度查询接口未就绪，请使用 Electron 模式运行');
      }
      
      // 4. 调用 IPC 获取额度信息
      const result = await window.desktop.quota.getQuota({
        providerId,
        accountId
      });
      
      // 5. 验证返回数据格式
      if (!result || typeof result.quotaUsed !== 'number' || typeof result.quotaTotal !== 'number') {
        throw new Error('额度数据格式无效');
      }
      
      // 6. 使用 updateAccount() 更新账号的 quotaUsed 和 quotaTotal 字段
      const updated = this.updateAccount(providerId, accountId, {
        quotaUsed: result.quotaUsed,
        quotaTotal: result.quotaTotal
      });
      
      if (!updated) {
        throw new Error('账号不存在或更新失败');
      }
      
      // 7. 使用 setCachedQuota() 更新缓存
      this.setCachedQuota(providerId, accountId, {
        quotaUsed: result.quotaUsed,
        quotaTotal: result.quotaTotal
      });
      
      // 8. 调用 persistDebounced() 持久化数据
      this.persistDebounced();
      
      // 9. 返回更新后的账号对象
      return updated;
    }
  }
});
