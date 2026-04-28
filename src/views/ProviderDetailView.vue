<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAccountCenterStore } from '../stores/accountCenter';

const route = useRoute();
const router = useRouter();
const center = useAccountCenterStore();

const providerId = computed(() => String(route.params.id || ''));
const provider = computed(() => center.providerById(providerId.value));
const accountList = computed(() => center.accountsByProvider[providerId.value] || []);
const stats = computed(() => center.providerStats(providerId.value));
const usagePercent = computed(() => {
  const max = Number(stats.value.maxManage || 0);
  if (!max) return 0;
  return Math.min(100, Math.round((Number(stats.value.total || 0) / max) * 100));
});

const runState = reactive({
  creating: false,
  currentStep: '',
  logs: [],
  error: ''
});

const steps = [
  '初始化任务',
  '启动浏览器与指纹',
  '填写注册信息',
  '提交并等待授权',
  '写入账号列表'
];

const activeStepIndex = ref(-1);

const selectedAccountId = ref('');
const activePanel = ref('create');
const createTimelineStage = ref('config');
const currentSettings = computed(() => center.settingsByProvider[providerId.value] || {});
const mailboxProviders = ref([]);
const logPanelRef = ref(null);
let removeProgressListener = null;

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
        return;
      }

      if (payload.type === 'log' && payload.line) {
        pushLog(payload.line);
      }

    });
  }
});

onUnmounted(() => {
  if (typeof removeProgressListener === 'function') {
    removeProgressListener();
  }
});

const selectedAccount = computed(() => {
  return accountList.value.find((a) => a.id === selectedAccountId.value) || null;
});

function pushLog(line) {
  runState.logs = [...runState.logs, `[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}] ${line}`];
  scrollLogToBottom();
}

function scrollLogToBottom() {
  nextTick(() => {
    const panel = logPanelRef.value;
    if (panel) {
      panel.scrollTop = panel.scrollHeight;
    }
  });
}

watch(() => runState.logs.length, scrollLogToBottom);

function setStep(index) {
  activeStepIndex.value = index;
  runState.currentStep = steps[index] || '';
  if (runState.currentStep) pushLog(`步骤 -> ${runState.currentStep}`);
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(toRaw(value)));
}

async function createAccount() {
  runState.error = '';
  runState.logs = [];
  runState.creating = true;
  activeStepIndex.value = -1;

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
      activePanel.value = 'usage';
      pushLog('账号创建成功，已加入左侧列表');
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
      activePanel.value = 'usage';
      pushLog('账号创建成功（演示类型）');
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
</script>

<template>
  <section class="grid gap-4">
    <div class="app-card command-shell flex flex-col gap-5 p-6 md:flex-row md:items-end md:justify-between">
      <div>
        <span class="brand-chip">Provider Workspace</span>
        <h1 class="app-title mt-4 text-3xl md:text-4xl">{{ provider?.name }}</h1>
        <p class="app-copy mt-2 max-w-2xl text-sm leading-6">{{ provider?.intro }}</p>
      </div>
      <button class="app-button-secondary" @click="router.push('/')">
        返回主界面
      </button>
    </div>

    <div class="grid gap-4 lg:grid-cols-12">
      <aside class="app-card lg:col-span-3 p-4">
        <p class="app-muted text-xs font-bold uppercase tracking-[0.18em]">Workspace</p>
        <div class="mt-3 grid gap-2">
          <button
            class="w-full rounded-2xl border px-3 py-3 text-left text-sm font-black transition"
            :class="activePanel === 'create' ? 'border-teal-400/60 bg-teal-400/10 shadow-[0_0_26px_rgba(45,212,191,0.14)]' : 'border-slate-500/20 hover:bg-white/[0.07]'"
            style="color: var(--app-text);"
            @click="activePanel = 'create'"
          >
            新增账号
            <span class="app-muted mt-1 block text-xs font-normal">配置流程并启动一次注册任务</span>
          </button>
          <button
            class="w-full rounded-2xl border px-3 py-3 text-left text-sm font-black transition"
            :class="activePanel === 'usage' ? 'border-teal-400/60 bg-teal-400/10 shadow-[0_0_26px_rgba(45,212,191,0.14)]' : 'border-slate-500/20 hover:bg-white/[0.07]'"
            style="color: var(--app-text);"
            @click="activePanel = 'usage'"
          >
            账号用量列表
            <span class="app-muted mt-1 block text-xs font-normal">查看账号数量、状态和本地记录</span>
          </button>
        </div>

        <div class="mt-5 grid gap-2 text-xs">
          <div class="metric-tile">
            <p class="app-muted">已注册</p>
            <p class="mt-1 text-xl font-semibold" style="color: var(--app-text);">{{ stats.successCount }}</p>
          </div>
          <div class="metric-tile">
            <p class="app-muted">总账号 / 上限</p>
            <p class="mt-1 text-xl font-semibold" style="color: var(--app-text);">{{ stats.total }} / {{ stats.maxManage }}</p>
          </div>
        </div>
      </aside>

      <main v-if="activePanel === 'create'" class="app-card lg:col-span-9 p-5 md:p-6">
        <div class="grid gap-4 lg:grid-cols-12">
          <aside class="app-card-strong lg:col-span-4 p-4">
            <p class="app-muted text-xs font-bold uppercase tracking-[0.18em]">创建时间线</p>
            <div class="mt-4 grid gap-3">
              <button
                class="w-full rounded-2xl border px-4 py-3 text-left transition"
                :class="createTimelineStage === 'config' ? 'border-teal-400/60 bg-teal-400/10 shadow-[0_0_24px_rgba(45,212,191,0.14)]' : 'border-slate-500/20 hover:bg-white/[0.06]'"
                @click="createTimelineStage = 'config'"
              >
                <span class="text-xs font-black" style="color: var(--app-text);">01 配置参数</span>
                <span class="app-muted mt-1 block text-xs">设置入口、姓名、邮箱服务、重试和指纹策略</span>
              </button>
              <div class="mx-auto h-6 w-px" style="background: color-mix(in srgb, var(--app-border) 70%, transparent);"></div>
              <button
                class="w-full rounded-2xl border px-4 py-3 text-left transition"
                :class="createTimelineStage === 'create' ? 'border-teal-400/60 bg-teal-400/10 shadow-[0_0_24px_rgba(45,212,191,0.14)]' : 'border-slate-500/20 hover:bg-white/[0.06]'"
                @click="createTimelineStage = 'create'"
              >
                <span class="text-xs font-black" style="color: var(--app-text);">02 创建账号</span>
                <span class="app-muted mt-1 block text-xs">启动自动化流程并实时观察执行日志</span>
              </button>
            </div>
          </aside>

          <section class="lg:col-span-8">
            <div v-if="createTimelineStage === 'config'" class="app-card-strong p-4">
              <div class="flex items-center justify-between gap-2">
                <p class="app-muted text-xs font-bold uppercase tracking-[0.18em]">流程配置</p>
                <div class="flex items-center gap-2">
                  <button class="app-button-secondary px-3 py-1 text-[11px]" @click="saveSettings">
                    保存配置
                  </button>
                  <button class="app-button-primary px-3 py-1 text-[11px]" @click="createTimelineStage = 'create'">
                    下一步
                  </button>
                </div>
              </div>
              <div class="mt-2 grid gap-2 md:grid-cols-2 text-xs">
                <label v-if="providerId === 'kiro'" class="control-label">
                  <span>注册页 URL</span>
                  <input v-model="currentSettings.url" class="control-input" />
                </label>
                <label v-if="providerId === 'kiro'" class="control-label">
                  <span>入口按钮选择器（可选）</span>
                  <input v-model="currentSettings.selectors.entry" placeholder='例如: button:has-text("AWS Builder ID")' class="control-input" />
                </label>
                <label class="control-label">
                  <span>用户名前缀</span>
                  <input v-model="currentSettings.usernamePrefix" class="control-input" />
                </label>
                <label v-if="providerId === 'kiro'" class="control-label">
                  <span>注册姓名 / 页面用户名</span>
                  <input v-model="currentSettings.fullName" placeholder="可填英文或中文，例如 Alex Chen / 张三" class="control-input" />
                </label>
                <label v-if="providerId === 'kiro'" class="control-label">
                  <span>邮箱服务</span>
                  <select v-model="currentSettings.mailbox.providerId" class="control-input">
                    <option v-for="item in mailboxProviders" :key="item.id" :value="item.id">
                      {{ item.name }}
                    </option>
                  </select>
                </label>
                <label v-else class="control-label">
                  <span>邮箱域名</span>
                  <input v-model="currentSettings.emailDomain" class="control-input" />
                </label>
                <label v-if="providerId === 'kiro'" class="control-label">
                  <span>默认密码（留空自动生成）</span>
                  <input v-model="currentSettings.password" type="password" placeholder="不填也可以，系统会自动生成" class="control-input" />
                </label>
                <label v-if="providerId === 'kiro'" class="control-label">
                  <span>失败刷新重试次数</span>
                  <input v-model.number="currentSettings.retryMax" type="number" min="0" max="10" class="control-input" />
                </label>
                <label v-if="providerId === 'kiro'" class="app-copy flex items-center gap-2">
                  <input v-model="currentSettings.fingerprintEnabled" type="checkbox" />
                  <span>启用浏览器指纹</span>
                </label>
                <label v-if="providerId === 'kiro'" class="control-label">
                  <span>指纹类型</span>
                  <select v-model="currentSettings.fingerprintType" :disabled="!currentSettings.fingerprintEnabled" class="control-input disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="random">random（随机）</option>
                    <option value="windows_chrome">windows_chrome</option>
                    <option value="mac_chrome">mac_chrome</option>
                    <option value="linux_chrome">linux_chrome</option>
                  </select>
                </label>
              </div>
            </div>

            <div v-else class="app-card-strong p-3 md:p-4">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-base font-black" style="color: var(--app-text);">创建日志</h2>
                <div class="flex items-center gap-2">
                  <button class="app-button-secondary px-3 py-1 text-[11px]" @click="createTimelineStage = 'config'">
                    返回参数配置
                  </button>
                  <button class="app-button-primary" :disabled="runState.creating" @click="createAccount">
                    {{ runState.creating ? '创建中...' : '创建账号' }}
                  </button>
                </div>
              </div>
              <div ref="logPanelRef" class="log-panel max-h-[560px]">
                <p v-if="runState.logs.length === 0">等待任务开始...</p>
                <p v-for="(line, idx) in runState.logs" :key="idx">{{ line }}</p>
              </div>
              <p v-if="runState.error" class="status-danger mt-3 text-sm">{{ runState.error }}</p>
            </div>
          </section>
        </div>
      </main>

      <main v-if="activePanel === 'usage'" class="app-card lg:col-span-6 p-4">
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 class="text-base font-black" style="color: var(--app-text);">账号用量列表</h2>
            <p class="app-copy mt-1 text-sm">按当前账号类型查看创建结果、状态、密码、本地落盘路径和 Token 预览。</p>
          </div>
        </div>

        <div class="mt-4 grid gap-3 md:grid-cols-3">
          <div class="metric-tile">
            <p class="app-muted text-xs">成功账号</p>
            <p class="mt-1 text-2xl font-black status-success">{{ stats.successCount }}</p>
          </div>
          <div class="metric-tile">
            <p class="app-muted text-xs">当前总量</p>
            <p class="mt-1 text-2xl font-black" style="color: var(--app-text);">{{ stats.total }}</p>
          </div>
          <div class="metric-tile">
            <p class="app-muted text-xs">剩余额度</p>
            <p class="mt-1 text-2xl font-black" style="color: var(--app-accent);">{{ Math.max(stats.maxManage - stats.total, 0) }}</p>
          </div>
        </div>

        <div class="metric-tile mt-4">
          <div class="flex items-center justify-between text-xs">
            <span class="app-muted">容量使用率</span>
            <span style="color: var(--app-text);">{{ usagePercent }}%</span>
          </div>
          <div class="mt-3 h-2 overflow-hidden rounded-full" style="background: var(--app-surface-subtle);">
            <div
              class="h-full rounded-full bg-gradient-to-r from-cyan-300 via-teal-300 to-emerald-300 transition-all duration-500"
              :style="{ width: `${usagePercent}%` }"
            ></div>
          </div>
        </div>

        <div class="app-card-strong mt-4 overflow-hidden p-2">
          <div class="max-h-[460px] overflow-auto">
            <table class="w-full min-w-[760px] table-auto text-left text-xs">
              <thead class="app-muted">
                <tr>
                  <th class="px-3 py-2">用户名</th>
                  <th class="px-3 py-2">邮箱</th>
                  <th class="px-3 py-2">状态</th>
                  <th class="px-3 py-2">创建时间</th>
                  <th class="px-3 py-2">Token</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in accountList"
                  :key="item.id"
                  class="cursor-pointer border-t transition hover:bg-white/[0.06]"
                  :class="selectedAccountId === item.id ? 'bg-teal-400/10' : ''"
                  style="border-color: var(--app-border); color: var(--app-text-muted);"
                  @click="selectedAccountId = item.id"
                >
                  <td class="px-3 py-3 font-semibold" style="color: var(--app-text);">{{ item.username || '-' }}</td>
                  <td class="px-3 py-3">{{ item.email || '-' }}</td>
                  <td class="px-3 py-3" :class="item.status === 'success' ? 'status-success' : 'status-danger'">{{ item.status }}</td>
                  <td class="px-3 py-3">{{ item.createdAt || '-' }}</td>
                  <td class="max-w-[220px] truncate px-3 py-3">{{ item.ssoTokenPreview || '-' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="accountList.length === 0" class="app-muted p-4 text-sm">暂无账号。点击“新增账号”开始创建。</p>
          </div>
        </div>
      </main>

      <aside v-if="activePanel === 'usage'" class="app-card lg:col-span-3 p-4">
        <h2 class="text-sm font-black" style="color: var(--app-text);">账号详情</h2>
        <p class="app-copy mt-1 text-xs leading-5">从左侧列表选择账号，查看密码、本地文件和 Token 预览。</p>

        <div class="metric-tile mt-4 text-xs">
          <template v-if="selectedAccount">
            <p class="font-semibold" style="color: var(--app-text);">{{ selectedAccount.username || '未命名账号' }}</p>
            <div class="mt-3 grid gap-2">
              <p style="color: var(--app-text-muted);">邮箱: {{ selectedAccount.email || '-' }}</p>
              <p class="break-all" style="color: var(--app-text-muted);">密码: {{ selectedAccount.password || '-' }}</p>
              <p :class="selectedAccount.status === 'success' ? 'status-success' : 'status-danger'">状态: {{ selectedAccount.status }}</p>
              <p style="color: var(--app-text-muted);">创建时间: {{ selectedAccount.createdAt || '-' }}</p>
              <p class="break-all" style="color: var(--app-text-muted);">本地文件: {{ selectedAccount.localFilePath || '-' }}</p>
              <p class="break-all" style="color: var(--app-text-muted);">Token: {{ selectedAccount.ssoTokenPreview || '-' }}</p>
            </div>
          </template>
          <p v-else class="app-muted mt-2">还没有选中账号。</p>
        </div>
      </aside>
    </div>
  </section>
</template>
