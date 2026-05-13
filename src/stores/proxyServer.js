import { defineStore } from 'pinia';

export const useProxyServerStore = defineStore('proxy-server', {
  state: () => ({
    running: false,
    port: 11434,
    host: '127.0.0.1',
    requestCount: 0,
    activeAccounts: 0,
    error: '',
    loading: false
  }),

  getters: {
    connectionString: (state) => `http://${state.host}:${state.port}/v1`,
    statusText: (state) => state.running ? 'running' : 'stopped',
    isRunning: (state) => state.running
  },

  actions: {
    async fetchStatus() {
      if (!window.desktop?.proxy) return;
      this.loading = true;
      try {
        const statusResult = await window.desktop.proxy.getStatus();
        if (statusResult.ok) {
          const data = statusResult.data;
          this.running = data.running || false;
          if (data.port) this.port = data.port;
          if (data.requestCount !== undefined) this.requestCount = data.requestCount;
          this.error = '';
        } else {
          this.error = statusResult.error || '获取状态失败';
        }

        const configResult = await window.desktop.proxy.getConfig();
        if (configResult.ok) {
          if (configResult.data.port) this.port = configResult.data.port;
          if (configResult.data.host) this.host = configResult.data.host;
        }

        const accountsResult = await window.desktop.proxy.getAccounts();
        if (accountsResult.ok) {
          this.activeAccounts = accountsResult.data?.length || 0;
        }
      } catch (err) {
        this.error = err.message;
        this.running = false;
      } finally {
        this.loading = false;
      }
    },

    startPolling(intervalMs = 5000) {
      this.fetchStatus();
      this._pollTimer = setInterval(() => this.fetchStatus(), intervalMs);
    },

    stopPolling() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    },

    async start() {
      if (!window.desktop?.proxy) return;
      try {
        await window.desktop.proxy.start();
        await this.fetchStatus();
      } catch (err) {
        this.error = err.message;
      }
    },

    async stop() {
      if (!window.desktop?.proxy) return;
      try {
        await window.desktop.proxy.stop();
        await this.fetchStatus();
      } catch (err) {
        this.error = err.message;
      }
    },

    async updateConfig(cfg) {
      if (!window.desktop?.proxy) return;
      try {
        await window.desktop.proxy.updateConfig(cfg);
        await this.fetchStatus();
      } catch (err) {
        this.error = err.message;
      }
    },

    copyConnectionString() {
      navigator.clipboard.writeText(this.connectionString).catch(() => {
        // fallback for older browsers
      });
    }
  }
});
