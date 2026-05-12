import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAccountCenterStore } from '../accountCenter.js';

describe('AccountCenterStore - refreshQuota', () => {
  let store;
  let mockGetQuota;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useAccountCenterStore();
    
    // Mock window.desktop.quota.getQuota
    mockGetQuota = vi.fn();
    global.window = {
      desktop: {
        quota: {
          getQuota: mockGetQuota
        }
      }
    };
    
    // Add a test account
    store.addAccount('kiro', {
      id: 'test-account-1',
      email: 'test@example.com',
      username: 'testuser',
      quotaUsed: 100,
      quotaTotal: 1000
    });
  });

  it('should successfully refresh quota and update account', async () => {
    // Mock successful API response
    mockGetQuota.mockResolvedValue({
      quotaUsed: 250,
      quotaTotal: 1000
    });

    const result = await store.refreshQuota('kiro', 'test-account-1');

    // Verify IPC was called with correct parameters
    expect(mockGetQuota).toHaveBeenCalledWith({
      providerId: 'kiro',
      accountId: 'test-account-1'
    });

    // Verify account was updated
    expect(result).toBeDefined();
    expect(result.quotaUsed).toBe(250);
    expect(result.quotaTotal).toBe(1000);

    // Verify other fields were not modified
    expect(result.email).toBe('test@example.com');
    expect(result.username).toBe('testuser');
  });

  it('should clear cache before making request', async () => {
    // Set up cache
    store.setCachedQuota('kiro', 'test-account-1', {
      quotaUsed: 100,
      quotaTotal: 1000
    });

    // Verify cache exists
    const cachedBefore = store.getCachedQuota('kiro', 'test-account-1');
    expect(cachedBefore).toBeDefined();

    // Mock API response
    mockGetQuota.mockResolvedValue({
      quotaUsed: 250,
      quotaTotal: 1000
    });

    await store.refreshQuota('kiro', 'test-account-1');

    // Verify cache was updated with new values
    const cachedAfter = store.getCachedQuota('kiro', 'test-account-1');
    expect(cachedAfter.quotaUsed).toBe(250);
    expect(cachedAfter.quotaTotal).toBe(1000);
  });

  it('should update cache after successful refresh', async () => {
    mockGetQuota.mockResolvedValue({
      quotaUsed: 300,
      quotaTotal: 1000
    });

    await store.refreshQuota('kiro', 'test-account-1');

    const cached = store.getCachedQuota('kiro', 'test-account-1');
    expect(cached).toBeDefined();
    expect(cached.quotaUsed).toBe(300);
    expect(cached.quotaTotal).toBe(1000);
  });

  it('should throw error when IPC interface is not available', async () => {
    // Remove IPC interface
    global.window.desktop.quota.getQuota = undefined;

    await expect(
      store.refreshQuota('kiro', 'test-account-1')
    ).rejects.toThrow('额度查询接口未就绪，请使用 Electron 模式运行');
  });

  it('should throw error when response data format is invalid', async () => {
    // Mock invalid response (missing quotaTotal)
    mockGetQuota.mockResolvedValue({
      quotaUsed: 250
    });

    await expect(
      store.refreshQuota('kiro', 'test-account-1')
    ).rejects.toThrow('额度数据格式无效');
  });

  it('should throw error when quotaUsed is not a number', async () => {
    mockGetQuota.mockResolvedValue({
      quotaUsed: '250',
      quotaTotal: 1000
    });

    await expect(
      store.refreshQuota('kiro', 'test-account-1')
    ).rejects.toThrow('额度数据格式无效');
  });

  it('should throw error when quotaTotal is not a number', async () => {
    mockGetQuota.mockResolvedValue({
      quotaUsed: 250,
      quotaTotal: '1000'
    });

    await expect(
      store.refreshQuota('kiro', 'test-account-1')
    ).rejects.toThrow('额度数据格式无效');
  });

  it('should throw error when account does not exist', async () => {
    mockGetQuota.mockResolvedValue({
      quotaUsed: 250,
      quotaTotal: 1000
    });

    await expect(
      store.refreshQuota('kiro', 'non-existent-account')
    ).rejects.toThrow('账号不存在或更新失败');
  });

  it('should not update cache when refresh fails', async () => {
    // Set up initial cache
    store.setCachedQuota('kiro', 'test-account-1', {
      quotaUsed: 100,
      quotaTotal: 1000
    });

    // Mock API error
    mockGetQuota.mockRejectedValue(new Error('Network error'));

    try {
      await store.refreshQuota('kiro', 'test-account-1');
    } catch (error) {
      // Expected to throw
    }

    // Cache should still have old values (or be cleared, but not updated with new values)
    // Since we clear cache before request, it should be empty
    const cached = store.getCachedQuota('kiro', 'test-account-1');
    expect(cached).toBeNull();
  });

  it('should only update quotaUsed and quotaTotal fields', async () => {
    mockGetQuota.mockResolvedValue({
      quotaUsed: 500,
      quotaTotal: 2000
    });

    const accountBefore = store.accountsByProvider.kiro.find(
      acc => acc.id === 'test-account-1'
    );

    await store.refreshQuota('kiro', 'test-account-1');

    const accountAfter = store.accountsByProvider.kiro.find(
      acc => acc.id === 'test-account-1'
    );

    // Verify quota fields were updated
    expect(accountAfter.quotaUsed).toBe(500);
    expect(accountAfter.quotaTotal).toBe(2000);

    // Verify other fields were not modified
    expect(accountAfter.email).toBe(accountBefore.email);
    expect(accountAfter.username).toBe(accountBefore.username);
    expect(accountAfter.password).toBe(accountBefore.password);
    expect(accountAfter.status).toBe(accountBefore.status);
    expect(accountAfter.id).toBe(accountBefore.id);
  });
});
