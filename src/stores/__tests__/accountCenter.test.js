import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAccountCenterStore } from '../accountCenter.js';

describe('AccountCenterStore - Proxy Configuration', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // Clear localStorage before each test
    localStorage.clear();
    // Use fake timers for debounced operations
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Restore real timers after each test
    vi.useRealTimers();
  });

  describe('setProxyConfig', () => {
    it('should save proxy configuration for an account', () => {
      const store = useAccountCenterStore();
      
      // Add a test account
      const account = store.addAccount('kiro', {
        email: 'test@example.com',
        username: 'test_user'
      });
      
      // Set proxy configuration
      const proxyConfig = {
        enabled: true,
        server: 'proxy.example.com',
        port: 8080,
        protocol: 'http',
        username: 'proxyuser',
        password: 'proxypass'
      };
      
      const updated = store.setProxyConfig('kiro', account.id, proxyConfig);
      
      // Verify the configuration was saved
      expect(updated.proxyConfig).toEqual(proxyConfig);
      
      // Verify it's persisted in the store
      const storedAccount = store.accountsByProvider.kiro.find(a => a.id === account.id);
      expect(storedAccount.proxyConfig).toEqual(proxyConfig);
    });

    it('should persist proxy configuration to localStorage', () => {
      const store = useAccountCenterStore();
      
      const account = store.addAccount('kiro', {
        email: 'test@example.com',
        username: 'test_user'
      });
      
      // Wait for debounced persist
      vi.advanceTimersByTime(300);
      
      const proxyConfig = {
        enabled: true,
        server: 'proxy.example.com',
        port: 8080,
        protocol: 'https'
      };
      
      store.setProxyConfig('kiro', account.id, proxyConfig);
      
      // Wait for debounced persist
      vi.advanceTimersByTime(300);
      
      // Verify localStorage was updated
      const stored = JSON.parse(localStorage.getItem('all2api-account-center-v1'));
      const storedAccount = stored.accountsByProvider.kiro.find(a => a.id === account.id);
      expect(storedAccount.proxyConfig).toEqual(proxyConfig);
    });

    it('should update existing proxy configuration', () => {
      const store = useAccountCenterStore();
      
      const account = store.addAccount('kiro', {
        email: 'test@example.com',
        username: 'test_user'
      });
      
      // Set initial configuration
      store.setProxyConfig('kiro', account.id, {
        enabled: true,
        server: 'proxy1.example.com',
        port: 8080,
        protocol: 'http'
      });
      
      // Update configuration
      const newConfig = {
        enabled: false,
        server: 'proxy2.example.com',
        port: 9090,
        protocol: 'https'
      };
      
      store.setProxyConfig('kiro', account.id, newConfig);
      
      const storedAccount = store.accountsByProvider.kiro.find(a => a.id === account.id);
      expect(storedAccount.proxyConfig).toEqual(newConfig);
    });
  });

  describe('getActiveAccount', () => {
    it('should return null when no accounts exist', () => {
      const store = useAccountCenterStore();
      const activeAccount = store.getActiveAccount('kiro');
      expect(activeAccount).toBeNull();
    });

    it('should return null when no accounts have been launched', () => {
      const store = useAccountCenterStore();
      
      store.addAccount('kiro', {
        email: 'test1@example.com',
        username: 'test_user1'
      });
      
      store.addAccount('kiro', {
        email: 'test2@example.com',
        username: 'test_user2'
      });
      
      const activeAccount = store.getActiveAccount('kiro');
      expect(activeAccount).toBeNull();
    });

    it('should return null when all accounts were launched more than 30 minutes ago', () => {
      const store = useAccountCenterStore();
      
      const now = new Date();
      const oldLaunchTime = new Date(now - 31 * 60 * 1000).toISOString(); // 31 minutes ago
      
      store.addAccount('kiro', {
        email: 'test@example.com',
        username: 'test_user',
        kiroClientLastLaunchAt: oldLaunchTime
      });
      
      const activeAccount = store.getActiveAccount('kiro');
      expect(activeAccount).toBeNull();
    });

    it('should return the account launched within the last 30 minutes', () => {
      const store = useAccountCenterStore();
      
      const now = new Date();
      const recentLaunchTime = new Date(now - 15 * 60 * 1000).toISOString(); // 15 minutes ago
      
      const account = store.addAccount('kiro', {
        email: 'test@example.com',
        username: 'test_user',
        kiroClientLastLaunchAt: recentLaunchTime
      });
      
      const activeAccount = store.getActiveAccount('kiro');
      expect(activeAccount).not.toBeNull();
      expect(activeAccount.id).toBe(account.id);
    });

    it('should return the most recently launched account when multiple are active', () => {
      const store = useAccountCenterStore();
      
      const now = new Date();
      const launch1 = new Date(now - 20 * 60 * 1000).toISOString(); // 20 minutes ago
      const launch2 = new Date(now - 10 * 60 * 1000).toISOString(); // 10 minutes ago
      const launch3 = new Date(now - 25 * 60 * 1000).toISOString(); // 25 minutes ago
      
      store.addAccount('kiro', {
        email: 'test1@example.com',
        username: 'test_user1',
        kiroClientLastLaunchAt: launch1
      });
      
      const mostRecent = store.addAccount('kiro', {
        email: 'test2@example.com',
        username: 'test_user2',
        kiroClientLastLaunchAt: launch2
      });
      
      store.addAccount('kiro', {
        email: 'test3@example.com',
        username: 'test_user3',
        kiroClientLastLaunchAt: launch3
      });
      
      const activeAccount = store.getActiveAccount('kiro');
      expect(activeAccount).not.toBeNull();
      expect(activeAccount.id).toBe(mostRecent.id);
      expect(activeAccount.email).toBe('test2@example.com');
    });

    it('should handle invalid date formats gracefully', () => {
      const store = useAccountCenterStore();
      
      store.addAccount('kiro', {
        email: 'test@example.com',
        username: 'test_user',
        kiroClientLastLaunchAt: 'invalid-date'
      });
      
      const activeAccount = store.getActiveAccount('kiro');
      expect(activeAccount).toBeNull();
    });

    it('should handle future dates gracefully', () => {
      const store = useAccountCenterStore();
      
      const now = new Date();
      const futureTime = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // 10 minutes in the future
      
      store.addAccount('kiro', {
        email: 'test@example.com',
        username: 'test_user',
        kiroClientLastLaunchAt: futureTime
      });
      
      const activeAccount = store.getActiveAccount('kiro');
      expect(activeAccount).toBeNull();
    });

    it('should only consider accounts from the specified provider', () => {
      const store = useAccountCenterStore();
      
      const now = new Date();
      const recentLaunchTime = new Date(now - 15 * 60 * 1000).toISOString();
      
      // Add account to 'kiro' provider
      store.addAccount('kiro', {
        email: 'kiro@example.com',
        username: 'kiro_user',
        kiroClientLastLaunchAt: recentLaunchTime
      });
      
      // Add account to 'codex' provider
      store.addAccount('codex', {
        email: 'codex@example.com',
        username: 'codex_user',
        kiroClientLastLaunchAt: recentLaunchTime
      });
      
      const kiroActive = store.getActiveAccount('kiro');
      const codexActive = store.getActiveAccount('codex');
      
      expect(kiroActive).not.toBeNull();
      expect(kiroActive.email).toBe('kiro@example.com');
      
      expect(codexActive).not.toBeNull();
      expect(codexActive.email).toBe('codex@example.com');
    });
  });

  describe('Integration - Proxy Config with Active Account', () => {
    it('should maintain proxy config when account becomes active', () => {
      const store = useAccountCenterStore();
      
      const account = store.addAccount('kiro', {
        email: 'test@example.com',
        username: 'test_user'
      });
      
      // Set proxy configuration
      const proxyConfig = {
        enabled: true,
        server: 'proxy.example.com',
        port: 8080,
        protocol: 'http'
      };
      
      store.setProxyConfig('kiro', account.id, proxyConfig);
      
      // Simulate account launch
      const now = new Date();
      store.updateAccount('kiro', account.id, {
        kiroClientLastLaunchAt: now.toISOString()
      });
      
      // Get active account
      const activeAccount = store.getActiveAccount('kiro');
      
      expect(activeAccount).not.toBeNull();
      expect(activeAccount.id).toBe(account.id);
      expect(activeAccount.proxyConfig).toEqual(proxyConfig);
    });
  });
});
