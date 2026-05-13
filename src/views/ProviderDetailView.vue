<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, toRaw } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAccountCenterStore } from '../stores/accountCenter';
import ProxyConfigModal from '../components/ProxyConfigModal.vue';
import QuotaDisplay from '../components/QuotaDisplay.vue';

const route = useRoute();
const router = useRouter();
const center = useAccountCenterStore();

// 池类型 tab
const poolTabs = computed(() => center.providers);
const activePoolTab = ref('kiro'); // 默认选中 Kiro
const providerId = computed(() => activePoolTab.value);
const provider = computed(() => center.providerById(providerId.value));
const accountList = computed(() => center.accountsByProvider[providerId.value] || []);
const stats = computed(() => center.providerStats(providerId.value));

function switchPoolTab(id) {
  activePoolTab.value = id;
}

// 性能优化：检查是否需要虚拟滚动（账号数量 > 100）
const shouldUseVirtualScroll = computed(() => accountList.value.length > 100);

const runState = reactive({
  creating: false,
  addingAccount: false,
  launchingClient: false,
  currentStep: '',
  logs: [],
  error: '',
  previewImage: '',
  previewLabel: '',
  previewUrl: ''
});

const steps = [
  '初始化任务',
  '启动浏览器与指纹',
  '填写注册信息',
  '提交并等待授权',
  '写入账号列表'
];

const activeStepIndex = ref(-1);
const viewMode = ref('list');

const selectedAccountId = ref('');
const currentSettings = computed(() => center.settingsByProvider[providerId.value] || {});
const mailboxProviders = ref([]);
let removeProgressListener = null;

// 反代配置相关
const showProxyModal = ref(false);
const selectedAccountForProxy = ref(null);

// 刷新状态管理
const refreshState = reactive({
  // 记录每个账号的加载状态
  loadingStates: new Map(), // Map<accountId, boolean>
  // 记录每个账号的错误消息
  errorMessages: new Map(), // Map<accountId, string>
  // 自动清除错误消息的定时器
  errorTimers: new Map() // Map<accountId, timeoutId>
});

// 检查账号是否正在刷新
function isRefreshing(accountId) {
  return refreshState.loadingStates.get(accountId) || false;
}

// 获取账号的错误消息
function getErrorMessage(accountId) {
  return refreshState.errorMessages.get(accountId) || '';
}

// 清除错误消息
function clearError(accountId) {
  refreshState.errorMessages.delete(accountId);
  const timer = refreshState.errorTimers.get(accountId);
  if (timer) {
    clearTimeout(timer);
    refreshState.errorTimers.delete(accountId);
  }
}

// 设置错误消息（带自动清除）
function setError(accountId, message) {
  refreshState.errorMessages.set(accountId, message);
  
  // 清除旧的定时器
  const oldTimer = refreshState.errorTimers.get(accountId);
  if (oldTimer) {
    clearTimeout(oldTimer);
  }
  
  // 设置新的自动清除定时器
  const timer = setTimeout(() => {
    clearError(accountId);
  }, 5000);
  
  refreshState.errorTimers.set(accountId, timer);
}

// 刷新账号额度
async function handleRefreshQuota(account) {
  const accountId = account.id;
  
  // 防止重复请求
  if (isRefreshing(accountId)) {
    return;
  }
  
  // 清除之前的错误消息
  clearError(accountId);
  
  // 设置加载状态
  refreshState.loadingStates.set(accountId, true);
  
  try {
    // 调用 store action
    await center.refreshQuota(providerId.value, accountId);
    
    // 成功：记录日志
    pushLog(`✅ 已刷新账号额度: ${account.username || account.email}`);
  } catch (error) {
    // 失败：显示错误消息
    const errorMessage = error instanceof Error ? error.message : String(error);
    setError(accountId, `刷新失败: ${errorMessage}`);
    pushLog(`❌ 刷新额度失败: ${errorMessage}`);
  } finally {
    // 清除加载状态
    refreshState.loadingStates.set(accountId, false);
  }
}

// 性能优化：窗口 resize 事件防抖
let resizeTimer = null;
function handleResize() {
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }
  resizeTimer = setTimeout(() => {
    // 窗口大小调整后的处理逻辑（如果需要）
    // 目前 CSS Grid 会自动处理响应式布局，无需额外处理
    resizeTimer = null;
  }, 150);
}

// 判断是否为活跃账号（30分钟内启动过）
function isActiveAccount(account) {
  // 处理边界情况：空值
  if (!account.kiroClientLastLaunchAt) return false;
  
  // 处理边界情况：无效日期
  const lastLaunch = new Date(account.kiroClientLastLaunchAt);
  if (isNaN(lastLaunch.getTime())) return false;
  
  const now = new Date();
  const diffMinutes = (now - lastLaunch) / 1000 / 60;
  
  // 处理边界情况：未来时间（视为非活跃）
  if (diffMinutes < 0) return false;
  
  return diffMinutes <= 30;
}

// 切换账号
async function switchAccount(account) {
  // 移除 isActiveAccount 检查，允许随时重新启动
  runState.error = '';
  if (!window.desktop?.automation?.launchKiroClient) {
    runState.error = 'Kiro 客户端启动接口未就绪，请使用 Electron 模式运行';
    pushLog(`失败: ${runState.error}`);
    return;
  }

  runState.launchingClient = true;
  try {
    const settings = toPlainObject(currentSettings.value);
    const resp = await window.desktop.automation.launchKiroClient({
      accountId: account.id,
      email: account.email,
      username: account.username,
      executablePath: settings.kiroClient?.executablePath || '',
      workspacePath: settings.kiroClient?.workspacePath || ''
    });

    center.updateAccount(providerId.value, account.id, {
      kiroProfilePath: resp.profilePath || account.kiroProfilePath || '',
      kiroExecutablePath: resp.executablePath || account.kiroExecutablePath || '',
      kiroClientLastLaunchAt: new Date().toLocaleString('zh-CN', { hour12: false })
    });
    
    const note = resp.note ? ` (${resp.note})` : '';
    pushLog(`✅ 已切换到账号: ${account.username || account.email}${note}`);
  } catch (error) {
    runState.error = error instanceof Error ? error.message : String(error);
    pushLog(`❌ 切换失败: ${runState.error}`);
  } finally {
    runState.launchingClient = false;
  }
}

// 打开反代配置
function openProxyConfig(account) {
  selectedAccountForProxy.value = account;
  showProxyModal.value = true;
}

// 保存反代配置 - 处理来自 ProxyConfigModal 的 save 事件
function handleProxySave(config) {
  if (!selectedAccountForProxy.value) {
    runState.error = '未选择账号';
    pushLog(`❌ 保存失败: 未选择账号`);
    return;
  }
  
  try {
    // 使用 store 的 setProxyConfig 方法保存配置
    center.setProxyConfig(providerId.value, selectedAccountForProxy.value.id, config);
    
    // 显示成功消息
    const statusText = config.enabled ? '已启用' : '已禁用';
    pushLog(`✅ 反代配置已保存: ${config.server}:${config.port} (${statusText})`);
    
    // 清除错误状态
    runState.error = '';
  } catch (error) {
    runState.error = error instanceof Error ? error.message : String(error);
    pushLog(`❌ 保存反代配置失败: ${runState.error}`);
  }
}

// 切换账号 API 反代禁用状态
function toggleApiProxy(account) {
  const disabled = account.apiProxyDisabled === true;
  center.updateAccount(providerId.value, account.id, {
    apiProxyDisabled: !disabled
  });
  pushLog(`${!disabled ? '❌ 已禁用' : '✅ 已启用'}账号反代: ${account.email || account.username}`);
}

// 额度细化显示（使用缓存优化）
function getQuotaBreakdown(item) {
  // 性能优化：尝试从缓存获取额度信息
  const cached = center.getCachedQuota(providerId.value, item.id);
  if (cached) {
    return cached;
  }
  
  // 如果没有缓存，计算并缓存结果
  let breakdown;
  if (item.quotaBreakdown) {
    breakdown = item.quotaBreakdown;
  } else {
    // 降级方案
    breakdown = {
      subscription: { used: 0, total: 0 },
      freeTier: { used: 0, total: 0 },
      bonus: { used: 0, total: 0 },
      total: { used: item.quotaUsed || 0, total: item.quotaTotal || 0 }
    };
  }
  
  // 缓存结果
  center.setCachedQuota(providerId.value, item.id, breakdown);
  return breakdown;
}

function getQuotaSegments(item) {
  const breakdown = getQuotaBreakdown(item);
  const total = breakdown.total.total;
  if (!total) return [];
  
  return [
    {
      type: 'subscription',
      label: '套餐',
      used: breakdown.subscription.used,
      total: breakdown.subscription.total,
      percent: (breakdown.subscription.used / total) * 100,
      color: 'from-cyan-400 to-cyan-500'
    },
    {
      type: 'freeTier',
      label: '免费',
      used: breakdown.freeTier.used,
      total: breakdown.freeTier.total,
      percent: (breakdown.freeTier.used / total) * 100,
      color: 'from-emerald-400 to-emerald-500'
    },
    {
      type: 'bonus',
      label: '福利',
      used: breakdown.bonus.used,
      total: breakdown.bonus.total,
      percent: (breakdown.bonus.used / total) * 100,
      color: 'from-purple-400 to-purple-500'
    }
  ].filter(segment => segment.total > 0);
}

onMounted(() => {
  center.load();
  if (!provider.value) {
    router.replace('/');
    return;
  }
  if (providerId.value === 'kiro' && !currentSettings.value.mailbox) {
    center.setSettings(providerId.value, {
      mailbox: {
        autoCreate: true,
        providerId: 'tempmail_lol'
      }
    });
  }
  if (accountList.value.length > 0) {
    selectedAccountId.value = accountList.value[0].id;
  }

  window.desktop?.mailbox?.listProviders?.()
    .then((list) => {
      mailboxProviders.value = Array.isArray(list) ? list : [];
    })
    .catch(() => {
      mailboxProviders.value = [];
    });

  if (window.desktop?.automation?.onProgress) {
    removeProgressListener = window.desktop.automation.onProgress((payload) => {
      if (!payload || typeof payload !== 'object') return;

      if (payload.type === 'reset') {
        runState.previewImage = '';
        runState.previewLabel = '';
        runState.previewUrl = '';
        return;
      }

      if (payload.type === 'log' && payload.line) {
        pushLog(payload.line);
      }

      if (payload.type === 'preview') {
        runState.previewImage = payload.image || '';
        runState.previewLabel = payload.label || '';
        runState.previewUrl = payload.pageUrl || '';
      }
    });
  }

  // 性能优化：添加窗口 resize 事件监听（防抖）
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('resize', handleResize);
  }
  
  // 性能优化：定期清理过期的额度缓存
  const cacheCleanupInterval = setInterval(() => {
    center.clearExpiredQuotaCache();
  }, 60000); // 每分钟清理一次
  
  // 保存清理定时器以便在组件卸载时清除
  onUnmounted(() => {
    clearInterval(cacheCleanupInterval);
  });
});

onUnmounted(() => {
  if (typeof removeProgressListener === 'function') {
    removeProgressListener();
  }
  
  // 性能优化：移除窗口 resize 事件监听
  if (typeof window !== 'undefined' && window.removeEventListener) {
    window.removeEventListener('resize', handleResize);
  }
  
  // 清理防抖定时器
  if (resizeTimer) {
    clearTimeout(resizeTimer);
  }
  
  // 清理刷新状态的错误定时器
  refreshState.errorTimers.forEach((timer) => {
    clearTimeout(timer);
  });
  refreshState.errorTimers.clear();
});

const selectedAccount = computed(() => {
  return accountList.value.find((a) => a.id === selectedAccountId.value) || null;
});

function pushLog(line) {
  runState.logs = [...runState.logs, `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${line}`];
}

function setStep(index) {
  activeStepIndex.value = index;
  runState.currentStep = steps[index] || '';
  if (runState.currentStep) pushLog(`步骤 -> ${runState.currentStep}`);
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(toRaw(value)));
}

function openCreateFlow() {
  viewMode.value = 'create';
  runState.error = '';
}

function backToAccountList() {
  viewMode.value = 'list';
}

function quotaLabel(item) {
  const total = Number(item?.quotaTotal || 0);
  const used = Number(item?.quotaUsed || 0);
  if (!total) return '待同步';
  return `${used}/${total}`;
}

function quotaPercent(item) {
  const total = Number(item?.quotaTotal || 0);
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(item?.quotaUsed || 0) / total) * 100)));
}

function modelList(item) {
  if (Array.isArray(item?.availableModels) && item.availableModels.length > 0) {
    return item.availableModels;
  }
  return ['Kiro', 'Claude Sonnet', 'Claude Haiku'];
}

async function addExistingAccount() {
  runState.error = '';
  runState.addingAccount = true;
  try {
    if (providerId.value !== 'kiro') {
      throw new Error('当前仅 Kiro 支持网页登录态添加');
    }
    if (!window.desktop?.automation?.captureKiroWebAccount) {
      throw new Error('添加账号接口未就绪，请使用 Electron 模式运行');
    }

    pushLog('已拉起浏览器，请在新窗口完成 Kiro 登录');
    const resp = await window.desktop.automation.captureKiroWebAccount(toPlainObject(currentSettings.value));
    // User closed browser — silently return without error
    if (resp?.reason === 'browser_closed') {
      pushLog('浏览器已关闭，已取消添加');
      return;
    }
    if (!resp?.ok || !resp.account) {
      throw new Error('未获取到登录凭证信息');
    }

    const next = center.addAccount(providerId.value, resp.account);
    selectedAccountId.value = next.id;
    pushLog(`已保存网页登录凭证: ${next.storageStatePath || '-'}`);
  } catch (error) {
    runState.error = error instanceof Error ? error.message : String(error);
    pushLog(`失败: ${runState.error}`);
  } finally {
    runState.addingAccount = false;
  }
}

async function createAccount() {
  runState.error = '';
  runState.logs = [];
  runState.creating = true;
  activeStepIndex.value = -1;
  runState.previewImage = '';
  runState.previewLabel = '';
  runState.previewUrl = '';

  try {
    setStep(0);
    await new Promise((r) => setTimeout(r, 300));

    if (providerId.value === 'kiro') {
      if (!window.desktop?.automation?.registerBatch) {
        throw new Error('自动化接口未就绪，请使用 Electron 模式运行');
      }

      setStep(1);
      const payload = {
        providerId: providerId.value,
        ...toPlainObject(currentSettings.value),
        count: 1
      };

      setStep(2);
      const resp = await window.desktop.automation.registerBatch(payload);

      if (Array.isArray(resp?.logs) && runState.logs.length === 0) {
        for (const line of resp.logs) {
          pushLog(line);
        }
      }

      const result = Array.isArray(resp?.results) ? resp.results[0] : null;
      if (!result) {
        throw new Error('未拿到注册结果');
      }

      setStep(3);
      if (result.status !== 'success') {
        throw new Error(result.error || '注册失败');
      }

      setStep(4);
      const next = center.addAccount(providerId.value, {
        status: 'success',
        email: result.account?.email || '',
        username: result.account?.username || '',
        password: result.account?.password || '',
        localFilePath: result.storedAccountPath || '',
        ssoTokenPreview: result.ssoTokenPreview || '',
        note: 'Kiro 流程创建'
      });
      selectedAccountId.value = next.id;
      pushLog('账号创建成功，已加入左侧列表');
      viewMode.value = 'list';
    } else {
      setStep(1);
      await new Promise((r) => setTimeout(r, 500));
      setStep(2);
      await new Promise((r) => setTimeout(r, 500));
      setStep(3);
      await new Promise((r) => setTimeout(r, 600));
      setStep(4);

      const prefix = currentSettings.value.usernamePrefix || providerId.value;
      const emailDomain = currentSettings.value.emailDomain || 'example.com';
      const seed = `${Date.now()}`;
      const username = `${prefix}${seed.slice(-6)}`;
      const next = center.addAccount(providerId.value, {
        status: 'success',
        username,
        email: `${username}@${emailDomain}`,
        note: '演示流程创建'
      });
      selectedAccountId.value = next.id;
      pushLog('账号创建成功（演示类型）');
      viewMode.value = 'list';
    }
  } catch (error) {
    runState.error = error instanceof Error ? error.message : String(error);
    pushLog(`失败: ${runState.error}`);
  } finally {
    runState.creating = false;
  }
}

function saveSettings() {
  center.setSettings(providerId.value, toPlainObject(currentSettings.value));
  pushLog('已保存当前类型配置');
}

async function launchSelectedKiroClient(mode) {
  runState.error = '';
  if (providerId.value !== 'kiro') return;
  if (!selectedAccount.value) {
    runState.error = '请先选择一个 Kiro 账号';
    return;
  }
  if (!window.desktop?.automation?.launchKiroClient) {
    runState.error = 'Kiro 客户端启动接口未就绪，请使用 Electron 模式运行';
    pushLog(`失败: ${runState.error}`);
    return;
  }

  runState.launchingClient = true;
  try {
    const settings = toPlainObject(currentSettings.value);
    const resp = await window.desktop.automation.launchKiroClient({
      accountId: selectedAccount.value.id,
      email: selectedAccount.value.email,
      username: selectedAccount.value.username,
      executablePath: settings.kiroClient?.executablePath || '',
      workspacePath: settings.kiroClient?.workspacePath || ''
    });

    const patch = {
      kiroProfilePath: resp.profilePath || selectedAccount.value.kiroProfilePath || '',
      kiroExecutablePath: resp.executablePath || selectedAccount.value.kiroExecutablePath || '',
      kiroClientLastLaunchAt: new Date().toLocaleString('zh-CN', { hour12: false })
    };
    if (mode === 'bind') {
      patch.kiroClientBoundAt = patch.kiroClientLastLaunchAt;
    }
    center.updateAccount(providerId.value, selectedAccount.value.id, patch);
    const note = resp.note ? ` (${resp.note})` : '';
    pushLog(mode === 'bind'
      ? `已拉起 Kiro 客户端，请在新窗口完成登录。本地档案: ${patch.kiroProfilePath}${note}`
      : `已按本地档案切换并拉起 Kiro 客户端: ${patch.kiroProfilePath}${note}`);
  } catch (error) {
    runState.error = error instanceof Error ? error.message : String(error);
    pushLog(`失败: ${runState.error}`);
  } finally {
    runState.launchingClient = false;
  }
}
</script>

<template>
  <section class="grid gap-4">
    <!-- Header -->
    <div class="neon-card p-4">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="neon-text-cyan text-2xl font-bold">池管理</h1>
          <p class="mt-1 text-sm text-slate-300">管理不同类型 AI 工具的账号池</p>
        </div>
      </div>

      <!-- Pool Tabs -->
      <div class="mt-4 flex gap-2 border-b border-slate-700/50 pb-3">
        <button
          v-for="tab in poolTabs"
          :key="tab.id"
          @click="switchPoolTab(tab.id)"
          class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="activePoolTab === tab.id
            ? 'bg-cyan-500/20 text-cyan-300'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'"
        >
          {{ tab.name.replace(/账号/g, '池') }}
          <span class="ml-1.5 text-xs opacity-60">({{ (center.accountsByProvider[tab.id] || []).length }})</span>
        </button>
      </div>
    </div>

    <div v-if="viewMode === 'list'" class="grid gap-4">
      <div class="neon-card p-4">
        <div class="flex flex-wrap items-center gap-3">
          <button class="neon-btn min-w-36" :disabled="runState.addingAccount" @click="addExistingAccount">
            {{ runState.addingAccount ? '等待登录...' : '添加账号' }}
          </button>
          <button class="neon-btn-primary min-w-36" @click="openCreateFlow">
            创建账号
          </button>
          <button class="neon-btn min-w-36" @click="saveSettings">
            保存配置
          </button>
        </div>
        <p v-if="runState.error" class="mt-3 text-sm text-rose-300">{{ runState.error }}</p>
      </div>

      <main class="neon-card p-4">
        <div class="flex items-center justify-between">
          <h2 class="neon-text-cyan text-base font-semibold">现有账号</h2>
          <span class="text-xs text-slate-400">
            {{ accountList.length }} 个账号
            <span v-if="shouldUseVirtualScroll" class="ml-2 text-amber-400" title="账号数量较多，建议使用筛选功能">
              ⚠️ 大量账号
            </span>
          </span>
        </div>
        <div class="mt-3 grid gap-4 grid-cols-[repeat(auto-fill,320px)] justify-start">
          <div
            v-for="item in accountList"
            :key="item.id"
            class="neon-card rise-on-hover w-[320px] cursor-pointer p-0 text-left transition"
            :class="selectedAccountId === item.id ? 'neon-card-active' : ''"
            @click="selectedAccountId = item.id"
          >
            <!-- Card Header: identity + actions -->
            <div class="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-100">{{ item.email || item.username || 'Kiro 账号' }}</p>
                <p v-if="item.email && item.username && item.email !== item.username" class="mt-1 truncate text-xs text-slate-400">{{ item.username }}</p>
                <p v-else-if="!item.email && !item.username" class="mt-1 truncate text-xs text-slate-400">本地账号</p>
              </div>
              <span class="mt-0.5 shrink-0 rounded-full border border-emerald-500/50 bg-emerald-950/40 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300 whitespace-nowrap">
                {{ item.authMode === 'web-session' ? '网页登录态' : item.status }}
              </span>
            </div>

            <!-- Action buttons row -->
            <div class="flex items-center gap-2 px-5 pb-3">
              <button
                @click.stop="handleRefreshQuota(item)"
                :disabled="isRefreshing(item.id)"
                class="neon-btn px-2.5 py-1.5 text-xs"
                title="刷新额度"
                aria-label="刷新额度"
                :aria-busy="isRefreshing(item.id) ? 'true' : 'false'"
              >
                <svg
                  class="mr-1 inline-block h-3.5 w-3.5 align-[-2px]"
                  :class="{ 'animate-spin': isRefreshing(item.id) }"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                刷新
              </button>
              <button
                v-if="providerId === 'kiro'"
                @click.stop="switchAccount(item)"
                :disabled="runState.launchingClient"
                class="neon-btn px-2.5 py-1.5 text-xs"
                :class="isActiveAccount(item) ? 'neon-btn-active' : ''"
                :title="isActiveAccount(item) ? '重新启动此账号' : '切换到此账号'"
              >
                <svg class="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                {{ isActiveAccount(item) ? '重启' : '切换' }}
              </button>
              <button
                @click.stop="toggleApiProxy(item)"
                class="px-2.5 py-1.5 text-xs rounded transition-colors"
                :class="item.apiProxyDisabled === true
                  ? 'bg-red-400/20 text-red-300 hover:bg-red-400/30'
                  : 'bg-emerald-400/20 text-emerald-300 hover:bg-emerald-400/30'"
                :title="item.apiProxyDisabled === true ? '点击启用反代' : '点击禁用反代'"
              >
                <svg class="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                {{ item.apiProxyDisabled === true ? '已禁用' : '禁用反代' }}
              </button>
            </div>

            <!-- Visual separator -->
            <hr class="neon-divider mx-5" />

            <!-- Quota section using QuotaDisplay component -->
            <div class="px-5 pt-3 pb-4">
              <QuotaDisplay :account="item" />
            </div>

            <!-- Model tags section -->
            <div v-if="modelList(item).length" class="px-5 pb-4 pt-1">
              <div class="flex flex-wrap gap-1.5">
                <span
                  v-for="model in modelList(item)"
                  :key="model"
                  class="neon-badge"
                >
                  {{ model }}
                </span>
              </div>
            </div>

            <!-- Error message -->
            <div
              v-if="getErrorMessage(item.id)"
              role="alert"
              class="mx-5 mb-4 rounded-md border border-rose-500/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-300"
            >
              <div class="flex items-center justify-between">
                <span>{{ getErrorMessage(item.id) }}</span>
                <button
                  @click.stop="clearError(item.id)"
                  class="ml-2 text-rose-400 hover:text-rose-300 transition"
                  aria-label="关闭错误提示"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
          <div v-if="accountList.length === 0" class="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            暂无现有账号
          </div>
        </div>
        <div v-if="selectedAccount?.discoveredApis?.length" class="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-xs">
          <p class="text-slate-400">发现接口</p>
          <p v-for="api in selectedAccount.discoveredApis.slice(0, 4)" :key="`${api.method}-${api.url}`" class="mt-1 break-all text-slate-300">
            {{ api.method }} {{ api.status }} {{ api.url }}
          </p>
        </div>
      </main>
    </div>

    <div v-else class="grid gap-4 lg:grid-cols-12">
      <aside class="neon-card lg:col-span-3 p-4">
        <div class="mb-3 grid gap-2">
          <button class="neon-btn" @click="backToAccountList">
            返回账号列表
          </button>
          <button class="neon-btn-primary" :disabled="runState.creating" @click="createAccount">
            {{ runState.creating ? '创建中...' : '开始创建账号' }}
          </button>
          <button class="neon-btn" @click="saveSettings">
            保存配置
          </button>
        </div>

        <p class="text-xs text-slate-400">账号列表</p>
        <div class="mt-2 max-h-[520px] space-y-2 overflow-auto">
          <button
            v-for="item in accountList"
            :key="item.id"
            class="w-full rounded-lg border px-3 py-2 text-left text-xs transition"
            :class="selectedAccountId === item.id ? 'border-cyan-500 bg-cyan-950/25 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.15)]' : 'border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500'"
            @click="selectedAccountId = item.id"
          >
            <p class="font-semibold">{{ item.username || item.email || 'Kiro 账号' }}</p>
            <p class="mt-1 text-[11px] text-slate-400">{{ item.email || '-' }}</p>
          </button>
          <p v-if="accountList.length === 0" class="rounded-lg border border-dashed border-slate-700 p-3 text-xs text-slate-500">暂无账号。</p>
        </div>
      </aside>

      <main class="neon-card lg:col-span-6 p-4">
        <h2 class="text-base font-semibold text-cyan-300">创建流程状态</h2>
        <div class="mt-3 grid gap-2">
          <div v-for="(step, idx) in steps" :key="step" class="rounded-lg border px-3 py-2 text-xs"
               :class="idx < activeStepIndex ? 'border-emerald-700 bg-emerald-950/35 text-emerald-300' : idx === activeStepIndex ? 'step-pulse border-cyan-400 bg-cyan-950/35 text-cyan-100' : 'border-slate-700 bg-slate-950/50 text-slate-400'">
            {{ idx + 1 }}. {{ step }}
          </div>
        </div>

        <div class="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/90 p-3 shadow-inner shadow-cyan-950/20">
          <div class="mb-3 overflow-hidden rounded-lg border border-slate-700 bg-slate-950/80">
            <div class="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-[11px] text-slate-400">
              <span>浏览器预览{{ runState.previewLabel ? ` · ${runState.previewLabel}` : '' }}</span>
              <span class="max-w-[52%] truncate text-right">{{ runState.previewUrl || '等待页面启动...' }}</span>
            </div>
            <div class="bg-slate-950/90">
              <img v-if="runState.previewImage" :src="runState.previewImage" alt="浏览器预览" class="h-64 w-full object-contain" />
              <div v-else class="flex h-64 items-center justify-center text-xs text-slate-500">
                注册流程启动后，这里会实时显示浏览器截图
              </div>
            </div>
          </div>
          <p class="text-xs text-slate-400">实时日志</p>
          <div class="mt-2 max-h-64 overflow-auto rounded-md bg-slate-900/40 px-2 py-2 text-xs leading-relaxed text-slate-300">
            <p v-if="runState.logs.length === 0">等待任务开始...</p>
            <p v-for="(line, idx) in runState.logs" :key="idx">{{ line }}</p>
          </div>
        </div>
        <p v-if="runState.error" class="mt-3 text-sm text-rose-300">{{ runState.error }}</p>

        <div class="mt-4 rounded-xl border border-slate-700 bg-slate-950/65 p-3">
          <p class="text-xs text-slate-400">流程配置（当前类型）</p>
          <div class="mt-2 grid gap-2 md:grid-cols-2 text-xs">
            <label v-if="providerId === 'kiro'" class="grid gap-1">
              <span class="text-slate-300">注册页 URL</span>
              <input v-model="currentSettings.url" class="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 focus:border-cyan-500 focus:outline-none" />
            </label>
            <label v-if="providerId === 'kiro'" class="grid gap-1">
              <span class="text-slate-300">入口按钮选择器（可选）</span>
              <input v-model="currentSettings.selectors.entry" placeholder='例如: button:has-text("AWS Builder ID")' class="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none" />
            </label>
            <label class="grid gap-1">
              <span class="text-slate-300">用户名前缀</span>
              <input v-model="currentSettings.usernamePrefix" class="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 focus:border-cyan-500 focus:outline-none" />
            </label>
            <label v-if="providerId === 'kiro'" class="grid gap-1">
              <span class="text-slate-300">邮箱服务</span>
              <select v-model="currentSettings.mailbox.providerId" class="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 focus:border-cyan-500 focus:outline-none">
                <option v-for="item in mailboxProviders" :key="item.id" :value="item.id">
                  {{ item.name }}
                </option>
              </select>
            </label>
            <label v-else class="grid gap-1">
              <span class="text-slate-300">邮箱域名</span>
              <input v-model="currentSettings.emailDomain" class="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 focus:border-cyan-500 focus:outline-none" />
            </label>
            <label v-if="providerId === 'kiro'" class="grid gap-1">
              <span class="text-slate-300">默认密码（留空自动生成）</span>
              <input v-model="currentSettings.password" type="password" placeholder="不填也可以，系统会自动生成" class="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none" />
            </label>
            <label v-if="providerId === 'kiro'" class="grid gap-1 md:col-span-2">
              <span class="text-slate-300">Kiro 客户端路径（可选）</span>
              <input v-model="currentSettings.kiroClient.executablePath" placeholder="自动查找失败时填写 Kiro.exe 完整路径" class="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none" />
            </label>
            <label v-if="providerId === 'kiro'" class="grid gap-1 md:col-span-2">
              <span class="text-slate-300">启动工作区（可选）</span>
              <input v-model="currentSettings.kiroClient.workspacePath" placeholder="需要打开指定项目时填写目录路径" class="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none" />
            </label>
          </div>
        </div>
      </main>

      <aside class="neon-card lg:col-span-3 p-4">
        <h2 class="text-sm font-semibold text-cyan-300">详情</h2>
        <div class="mt-3 space-y-2 text-xs">
          <div class="rounded-lg border border-slate-700/80 bg-slate-950/60 p-3">
            <p class="text-slate-400">已注册</p>
            <p class="mt-1 text-xl font-semibold text-white">{{ stats.successCount }}</p>
          </div>
          <div class="rounded-lg border border-slate-700/80 bg-slate-950/60 p-3">
            <p class="text-slate-400">总账号</p>
            <p class="mt-1 text-xl font-semibold text-white">{{ stats.total }}</p>
          </div>
          <div class="rounded-lg border border-slate-700/80 bg-slate-950/60 p-3">
            <p class="text-slate-400">可管理上限</p>
            <p class="mt-1 text-xl font-semibold text-white">{{ stats.maxManage }}</p>
          </div>
        </div>
      </aside>
    </div>

    <!-- 反代配置模态框 -->
    <ProxyConfigModal 
      v-model:show="showProxyModal" 
      :account="selectedAccountForProxy"
      @save="handleProxySave"
    />
  </section>
</template>

<style scoped>
.step-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
