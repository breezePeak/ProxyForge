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
        maxManage: 300
      },
      {
        id: 'codex',
        name: 'Codex 账号',
        intro: '通用 AI 工具账号管理占位',
        maxManage: 200
      },
      {
        id: 'cursor',
        name: 'Cursor 账号',
        intro: 'Cursor 类账号流程占位',
        maxManage: 200
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
        password: 'admin123456aA!',
        birthYear: 1998,
        birthMonth: 1,
        birthDay: 1,
        headless: false,
        stopOnError: true,
        fingerprintType: 'random',
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
    ...createDefaults()
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
    addAccount(providerId, payload) {
      const list = this.accountsByProvider[providerId] || [];
      const next = {
        id: `${providerId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: nowText(),
        status: payload.status || 'success',
        email: payload.email || '',
        username: payload.username || '',
        password: payload.password || '',
        localFilePath: payload.localFilePath || '',
        note: payload.note || '',
        ssoTokenPreview: payload.ssoTokenPreview || ''
      };
      this.accountsByProvider[providerId] = [next, ...list];
      this.persist();
      return next;
    },
    setSettings(providerId, patch) {
      this.settingsByProvider[providerId] = mergeProviderSettings(this.settingsByProvider[providerId] || {}, patch);
      this.persist();
    }
  }
});
