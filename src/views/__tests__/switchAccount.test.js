import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ProviderDetailView from '../ProviderDetailView.vue';
import { useAccountCenterStore } from '../../stores/accountCenter';

/**
 * 测试任务 2.3: 切换账号逻辑
 * 
 * 验证 switchAccount 函数的以下功能：
 * 1. 检查账号是否为活跃账号，如果是则直接返回
 * 2. 调用 window.desktop.automation.launchKiroClient 启动客户端
 * 3. 传递正确的账号信息
 * 4. 处理启动成功：更新 kiroClientLastLaunchAt
 * 5. 处理启动失败：显示错误提示
 */

describe('switchAccount 函数测试', () => {
  let wrapper;
  let store;
  let router;
  let mockLaunchKiroClient;

  beforeEach(async () => {
    // 创建新的 Pinia 实例
    const pinia = createPinia();
    setActivePinia(pinia);
    store = useAccountCenterStore();

    // 创建路由
    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: '/provider/:id',
          component: ProviderDetailView
        }
      ]
    });

    // 导航到测试路由
    await router.push('/provider/kiro');
    await router.isReady();

    // Mock window.desktop.automation.launchKiroClient
    mockLaunchKiroClient = vi.fn();
    global.window = {
      desktop: {
        automation: {
          launchKiroClient: mockLaunchKiroClient,
          onProgress: vi.fn(() => vi.fn()) // Mock onProgress listener
        },
        mailbox: {
          listProviders: vi.fn().mockResolvedValue([])
        }
      }
    };

    // 添加测试提供商
    store.providers = [
      {
        id: 'kiro',
        name: 'Kiro',
        intro: 'Kiro AI Assistant'
      }
    ];

    // 初始化账号列表
    store.accountsByProvider = {
      kiro: []
    };

    // 初始化设置
    store.settingsByProvider = {
      kiro: {
        kiroClient: {
          executablePath: 'C:\\Program Files\\Kiro\\Kiro.exe',
          workspacePath: 'C:\\Users\\test\\workspace'
        }
      }
    };
  });

  it('应该在账号为活跃状态时直接返回，不调用启动接口', async () => {
    // 创建一个活跃账号（10分钟前启动）
    const now = new Date();
    const activeAccount = {
      id: 'test-account-1',
      email: 'test@example.com',
      username: 'test_user',
      kiroClientLastLaunchAt: new Date(now.getTime() - 10 * 60 * 1000).toLocaleString('zh-CN', { hour12: false })
    };

    store.accountsByProvider.kiro.push(activeAccount);

    // 挂载组件
    wrapper = mount(ProviderDetailView, {
      global: {
        plugins: [store, router]
      }
    });

    // 调用 switchAccount
    await wrapper.vm.switchAccount(activeAccount);

    // 验证：不应该调用启动接口
    expect(mockLaunchKiroClient).not.toHaveBeenCalled();
  });

  it('应该在账号非活跃时调用启动接口并传递正确参数', async () => {
    // 创建一个非活跃账号（35分钟前启动）
    const now = new Date();
    const inactiveAccount = {
      id: 'test-account-2',
      email: 'inactive@example.com',
      username: 'inactive_user',
      kiroClientLastLaunchAt: new Date(now.getTime() - 35 * 60 * 1000).toLocaleString('zh-CN', { hour12: false }),
      kiroProfilePath: 'C:\\Users\\test\\.kiro\\profiles\\profile1',
      kiroExecutablePath: 'C:\\Program Files\\Kiro\\Kiro.exe'
    };

    store.accountsByProvider.kiro.push(inactiveAccount);

    // Mock 成功响应
    mockLaunchKiroClient.mockResolvedValue({
      profilePath: 'C:\\Users\\test\\.kiro\\profiles\\profile1',
      executablePath: 'C:\\Program Files\\Kiro\\Kiro.exe'
    });

    // 挂载组件
    wrapper = mount(ProviderDetailView, {
      global: {
        plugins: [store, router]
      }
    });

    // 调用 switchAccount
    await wrapper.vm.switchAccount(inactiveAccount);

    // 验证：应该调用启动接口
    expect(mockLaunchKiroClient).toHaveBeenCalledTimes(1);

    // 验证：传递的参数正确
    expect(mockLaunchKiroClient).toHaveBeenCalledWith({
      accountId: 'test-account-2',
      email: 'inactive@example.com',
      username: 'inactive_user',
      executablePath: 'C:\\Program Files\\Kiro\\Kiro.exe',
      workspacePath: 'C:\\Users\\test\\workspace'
    });
  });

  it('应该在启动成功后更新 kiroClientLastLaunchAt', async () => {
    // 创建一个非活跃账号
    const now = new Date();
    const inactiveAccount = {
      id: 'test-account-3',
      email: 'success@example.com',
      username: 'success_user',
      kiroClientLastLaunchAt: new Date(now.getTime() - 40 * 60 * 1000).toLocaleString('zh-CN', { hour12: false }),
      kiroProfilePath: '',
      kiroExecutablePath: ''
    };

    // 先添加账号到 store
    const addedAccount = store.addAccount('kiro', inactiveAccount);

    // Mock 成功响应
    mockLaunchKiroClient.mockResolvedValue({
      profilePath: 'C:\\Users\\test\\.kiro\\profiles\\new-profile',
      executablePath: 'C:\\Program Files\\Kiro\\Kiro.exe'
    });

    // 挂载组件
    wrapper = mount(ProviderDetailView, {
      global: {
        plugins: [store, router]
      }
    });

    // 记录调用前的时间
    const beforeCall = new Date();

    // 调用 switchAccount，使用添加后的账号对象
    await wrapper.vm.switchAccount(addedAccount);

    // 等待 Vue 更新
    await wrapper.vm.$nextTick();

    // 记录调用后的时间
    const afterCall = new Date();

    // 获取更新后的账号
    const updatedAccount = store.accountsByProvider.kiro.find(a => a.id === addedAccount.id);

    // 验证：账号存在
    expect(updatedAccount).toBeTruthy();

    // 验证：kiroClientLastLaunchAt 已更新
    expect(updatedAccount.kiroClientLastLaunchAt).toBeTruthy();

    // 验证：更新的时间在合理范围内（调用前后之间）
    const updatedTime = new Date(updatedAccount.kiroClientLastLaunchAt);
    expect(updatedTime.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime() - 1000); // 允许1秒误差
    expect(updatedTime.getTime()).toBeLessThanOrEqual(afterCall.getTime() + 1000);

    // 验证：kiroProfilePath 已更新
    expect(updatedAccount.kiroProfilePath).toBe('C:\\Users\\test\\.kiro\\profiles\\new-profile');

    // 验证：kiroExecutablePath 已更新
    expect(updatedAccount.kiroExecutablePath).toBe('C:\\Program Files\\Kiro\\Kiro.exe');
  });

  it('应该在启动失败时显示错误提示', async () => {
    // 创建一个非活跃账号
    const now = new Date();
    const inactiveAccount = {
      id: 'test-account-4',
      email: 'fail@example.com',
      username: 'fail_user',
      kiroClientLastLaunchAt: new Date(now.getTime() - 40 * 60 * 1000).toLocaleString('zh-CN', { hour12: false })
    };

    store.accountsByProvider.kiro.push(inactiveAccount);

    // Mock 失败响应
    const errorMessage = '客户端启动失败：找不到可执行文件';
    mockLaunchKiroClient.mockRejectedValue(new Error(errorMessage));

    // 挂载组件
    wrapper = mount(ProviderDetailView, {
      global: {
        plugins: [store, router]
      }
    });

    // 调用 switchAccount
    await wrapper.vm.switchAccount(inactiveAccount);

    // 验证：错误信息已设置
    expect(wrapper.vm.runState.error).toBe(errorMessage);

    // 验证：日志中包含错误信息
    const errorLog = wrapper.vm.runState.logs.find(log => log.includes('❌ 切换失败'));
    expect(errorLog).toBeTruthy();
    expect(errorLog).toContain(errorMessage);
  });

  it('应该在 window.desktop.automation.launchKiroClient 不可用时显示错误', async () => {
    // 移除 launchKiroClient 接口
    global.window.desktop.automation.launchKiroClient = undefined;

    // 创建一个非活跃账号
    const now = new Date();
    const inactiveAccount = {
      id: 'test-account-5',
      email: 'no-api@example.com',
      username: 'no_api_user',
      kiroClientLastLaunchAt: new Date(now.getTime() - 40 * 60 * 1000).toLocaleString('zh-CN', { hour12: false })
    };

    store.accountsByProvider.kiro.push(inactiveAccount);

    // 挂载组件
    wrapper = mount(ProviderDetailView, {
      global: {
        plugins: [store, router]
      }
    });

    // 调用 switchAccount
    await wrapper.vm.switchAccount(inactiveAccount);

    // 验证：错误信息已设置
    expect(wrapper.vm.runState.error).toBe('Kiro 客户端启动接口未就绪，请使用 Electron 模式运行');

    // 验证：日志中包含错误信息
    const errorLog = wrapper.vm.runState.logs.find(log => log.includes('失败'));
    expect(errorLog).toBeTruthy();
  });

  it('应该在切换过程中设置 launchingClient 状态', async () => {
    // 创建一个非活跃账号
    const now = new Date();
    const inactiveAccount = {
      id: 'test-account-6',
      email: 'loading@example.com',
      username: 'loading_user',
      kiroClientLastLaunchAt: new Date(now.getTime() - 40 * 60 * 1000).toLocaleString('zh-CN', { hour12: false })
    };

    store.accountsByProvider.kiro.push(inactiveAccount);

    // Mock 一个延迟的响应
    let resolvePromise;
    const delayedPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockLaunchKiroClient.mockReturnValue(delayedPromise);

    // 挂载组件
    wrapper = mount(ProviderDetailView, {
      global: {
        plugins: [store, router]
      }
    });

    // 开始调用 switchAccount（不等待完成）
    const switchPromise = wrapper.vm.switchAccount(inactiveAccount);

    // 验证：launchingClient 应该为 true
    expect(wrapper.vm.runState.launchingClient).toBe(true);

    // 完成 Promise
    resolvePromise({
      profilePath: 'C:\\Users\\test\\.kiro\\profiles\\profile',
      executablePath: 'C:\\Program Files\\Kiro\\Kiro.exe'
    });

    // 等待 switchAccount 完成
    await switchPromise;

    // 验证：launchingClient 应该恢复为 false
    expect(wrapper.vm.runState.launchingClient).toBe(false);
  });

  it('应该在成功切换后添加成功日志', async () => {
    // 创建一个非活跃账号
    const now = new Date();
    const inactiveAccount = {
      id: 'test-account-7',
      email: 'log@example.com',
      username: 'log_user',
      kiroClientLastLaunchAt: new Date(now.getTime() - 40 * 60 * 1000).toLocaleString('zh-CN', { hour12: false })
    };

    store.accountsByProvider.kiro.push(inactiveAccount);

    // Mock 成功响应
    mockLaunchKiroClient.mockResolvedValue({
      profilePath: 'C:\\Users\\test\\.kiro\\profiles\\profile',
      executablePath: 'C:\\Program Files\\Kiro\\Kiro.exe'
    });

    // 挂载组件
    wrapper = mount(ProviderDetailView, {
      global: {
        plugins: [store, router]
      }
    });

    // 调用 switchAccount
    await wrapper.vm.switchAccount(inactiveAccount);

    // 验证：日志中包含成功信息
    const successLog = wrapper.vm.runState.logs.find(log => log.includes('✅ 已切换到账号'));
    expect(successLog).toBeTruthy();
    expect(successLog).toContain('log_user');
  });
});
