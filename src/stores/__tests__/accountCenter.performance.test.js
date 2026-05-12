import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAccountCenterStore } from '../accountCenter';

describe('AccountCenter Store - Performance Optimizations', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Debounced Persist', () => {
    it('should debounce multiple persist calls', () => {
      const store = useAccountCenterStore();
      const persistSpy = vi.spyOn(store, 'persist');

      // Add multiple accounts quickly
      store.addAccount('kiro', { email: 'test1@example.com' });
      store.addAccount('kiro', { email: 'test2@example.com' });
      store.addAccount('kiro', { email: 'test3@example.com' });

      // Persist should not be called immediately
      expect(persistSpy).not.toHaveBeenCalled();

      // After debounce delay, persist should be called once
      vi.advanceTimersByTime(300);
      expect(persistSpy).toHaveBeenCalledTimes(1);
    });

    it('should reset debounce timer on each update', () => {
      const store = useAccountCenterStore();
      const persistSpy = vi.spyOn(store, 'persist');

      store.addAccount('kiro', { email: 'test1@example.com' });
      vi.advanceTimersByTime(200);
      store.addAccount('kiro', { email: 'test2@example.com' });
      vi.advanceTimersByTime(200);

      // Should not have persisted yet
      expect(persistSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(persistSpy).toHaveBeenCalledTimes(1);
    });

    it('should use debounced persist in updateAccount', () => {
      const store = useAccountCenterStore();
      const account = store.addAccount('kiro', { email: 'test@example.com' });
      
      vi.advanceTimersByTime(300); // Clear initial persist
      const persistSpy = vi.spyOn(store, 'persist');

      // Multiple updates
      store.updateAccount('kiro', account.id, { username: 'user1' });
      store.updateAccount('kiro', account.id, { username: 'user2' });
      store.updateAccount('kiro', account.id, { username: 'user3' });

      expect(persistSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);
      expect(persistSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Quota Cache', () => {
    it('should cache quota information', () => {
      const store = useAccountCenterStore();
      const quotaData = {
        subscription: { used: 100, total: 300 },
        freeTier: { used: 50, total: 200 },
        bonus: { used: 0, total: 0 },
        total: { used: 150, total: 500 }
      };

      store.setCachedQuota('kiro', 'account1', quotaData);
      const cached = store.getCachedQuota('kiro', 'account1');

      expect(cached).toEqual(quotaData);
    });

    it('should return null for non-existent cache', () => {
      const store = useAccountCenterStore();
      const cached = store.getCachedQuota('kiro', 'nonexistent');
      expect(cached).toBeNull();
    });

    it('should expire cache after 5 minutes', () => {
      const store = useAccountCenterStore();
      const quotaData = {
        subscription: { used: 100, total: 300 },
        freeTier: { used: 50, total: 200 },
        bonus: { used: 0, total: 0 },
        total: { used: 150, total: 500 }
      };

      store.setCachedQuota('kiro', 'account1', quotaData);
      
      // Cache should be valid before 5 minutes
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(store.getCachedQuota('kiro', 'account1')).toEqual(quotaData);

      // Cache should expire after 5 minutes
      vi.advanceTimersByTime(1 * 60 * 1000 + 1);
      expect(store.getCachedQuota('kiro', 'account1')).toBeNull();
    });

    it('should clear expired quota cache', () => {
      const store = useAccountCenterStore();
      
      store.setCachedQuota('kiro', 'account1', { total: { used: 100, total: 500 } });
      vi.advanceTimersByTime(3 * 60 * 1000);
      store.setCachedQuota('kiro', 'account2', { total: { used: 200, total: 500 } });
      vi.advanceTimersByTime(2 * 60 * 1000 + 1);

      store.clearExpiredQuotaCache();

      // account1 should be expired and cleared
      expect(store.getCachedQuota('kiro', 'account1')).toBeNull();
      // account2 should still be valid
      expect(store.getCachedQuota('kiro', 'account2')).not.toBeNull();
    });

    it('should use different cache keys for different accounts', () => {
      const store = useAccountCenterStore();
      
      const quota1 = { total: { used: 100, total: 500 } };
      const quota2 = { total: { used: 200, total: 600 } };

      store.setCachedQuota('kiro', 'account1', quota1);
      store.setCachedQuota('kiro', 'account2', quota2);

      expect(store.getCachedQuota('kiro', 'account1')).toEqual(quota1);
      expect(store.getCachedQuota('kiro', 'account2')).toEqual(quota2);
    });
  });

  describe('Active Account Detection', () => {
    it('should identify active account within 30 minutes', () => {
      const store = useAccountCenterStore();
      const now = new Date();
      const twentyMinutesAgo = new Date(now - 20 * 60 * 1000).toLocaleString('zh-CN', { hour12: false });

      const account = store.addAccount('kiro', {
        email: 'test@example.com',
        kiroClientLastLaunchAt: twentyMinutesAgo
      });

      vi.advanceTimersByTime(300);

      const activeAccount = store.getActiveAccount('kiro');
      expect(activeAccount).not.toBeNull();
      expect(activeAccount.id).toBe(account.id);
    });

    it('should not identify account as active after 30 minutes', () => {
      const store = useAccountCenterStore();
      const now = new Date();
      const thirtyOneMinutesAgo = new Date(now - 31 * 60 * 1000).toLocaleString('zh-CN', { hour12: false });

      store.addAccount('kiro', {
        email: 'test@example.com',
        kiroClientLastLaunchAt: thirtyOneMinutesAgo
      });

      vi.advanceTimersByTime(300);

      const activeAccount = store.getActiveAccount('kiro');
      expect(activeAccount).toBeNull();
    });

    it('should return most recent active account when multiple are active', () => {
      const store = useAccountCenterStore();
      const now = new Date();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toLocaleString('zh-CN', { hour12: false });
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000).toLocaleString('zh-CN', { hour12: false });

      const account1 = store.addAccount('kiro', {
        email: 'test1@example.com',
        kiroClientLastLaunchAt: tenMinutesAgo
      });

      const account2 = store.addAccount('kiro', {
        email: 'test2@example.com',
        kiroClientLastLaunchAt: fiveMinutesAgo
      });

      vi.advanceTimersByTime(300);

      const activeAccount = store.getActiveAccount('kiro');
      expect(activeAccount).not.toBeNull();
      expect(activeAccount.id).toBe(account2.id);
    });
  });

  describe('Performance with Large Datasets', () => {
    it('should handle adding 100+ accounts efficiently', () => {
      const store = useAccountCenterStore();
      const startTime = Date.now();

      // Add 150 accounts
      for (let i = 0; i < 150; i++) {
        store.addAccount('kiro', {
          email: `test${i}@example.com`,
          username: `user${i}`
        });
      }

      vi.advanceTimersByTime(300);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 1 second)
      expect(duration).toBeLessThan(1000);
      expect(store.accountsByProvider.kiro.length).toBe(150);
    });

    it('should handle quota cache for many accounts', () => {
      const store = useAccountCenterStore();

      // Cache quota for 200 accounts
      for (let i = 0; i < 200; i++) {
        store.setCachedQuota('kiro', `account${i}`, {
          total: { used: i * 10, total: 500 }
        });
      }

      // Verify all caches are accessible
      for (let i = 0; i < 200; i++) {
        const cached = store.getCachedQuota('kiro', `account${i}`);
        expect(cached).not.toBeNull();
        expect(cached.total.used).toBe(i * 10);
      }
    });
  });
});
