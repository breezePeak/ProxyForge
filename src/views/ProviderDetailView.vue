<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, toRaw } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAccountCenterStore } from '../stores/accountCenter';

const route = useRoute();
const router = useRouter();
const center = useAccountCenterStore();

const providerId = computed(() => String(route.params.id || ''));
const provider = computed(() => center.providerById(providerId.value));
const accountList = computed(() => center.accountsByProvider[providerId.value] || []);
const stats = computed(() => center.providerStats(providerId.value));

const runState = reactive({
  creating: false,
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

const selectedAccountId = ref('');
const currentSettings = computed(() => center.settingsByProvider[providerId.value] || {});
const mailboxProviders = ref([]);
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
}

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
    <div class="glass-card flex items-center justify-between p-4">
      <div>
        <h1 class="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-2xl font-bold text-transparent">{{ provider?.name }}</h1>
        <p class="mt-1 text-sm text-slate-300">{{ provider?.intro }}</p>
      </div>
      <button class="rounded-lg border border-slate-600 bg-slate-900/50 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-500 hover:bg-slate-900/80" @click="router.push('/')">
        返回主界面
      </button>
    </div>

    <div class="grid gap-4 lg:grid-cols-12">
      <aside class="glass-card lg:col-span-3 p-4">
        <div class="mb-3 flex gap-2">
          <button class="flex-1 rounded-lg bg-gradient-to-r from-cyan-400 to-emerald-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-600" :disabled="runState.creating" @click="createAccount">
            {{ runState.creating ? '创建中...' : '创建账号' }}
          </button>
          <button class="rounded-lg border border-slate-600 bg-slate-900/50 px-3 py-2 text-xs text-slate-200 transition hover:border-cyan-500" @click="saveSettings">
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
            <p class="font-semibold">{{ item.username || '-' }}</p>
            <p class="mt-1 text-[11px] text-slate-400">{{ item.email || '-' }}</p>
            <p class="mt-1" :class="item.status === 'success' ? 'text-emerald-300' : 'text-rose-300'">{{ item.status }}</p>
          </button>
          <p v-if="accountList.length === 0" class="rounded-lg border border-dashed border-slate-700 p-3 text-xs text-slate-500">暂无账号，点击上方“创建账号”。</p>
        </div>
      </aside>

      <main class="glass-card lg:col-span-6 p-4">
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
              <img
                v-if="runState.previewImage"
                :src="runState.previewImage"
                alt="浏览器预览"
                class="h-64 w-full object-contain"
              />
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
          </div>
        </div>
      </main>

      <aside class="glass-card lg:col-span-3 p-4">
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

        <div class="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/60 p-3 text-xs">
          <p class="text-slate-400">当前选中账号</p>
          <template v-if="selectedAccount">
            <p class="mt-2 text-slate-200">用户名: {{ selectedAccount.username || '-' }}</p>
            <p class="mt-1 text-slate-200">邮箱: {{ selectedAccount.email || '-' }}</p>
            <p class="mt-1 text-slate-200 break-all">密码: {{ selectedAccount.password || '-' }}</p>
            <p class="mt-1 text-slate-200">创建时间: {{ selectedAccount.createdAt }}</p>
            <p class="mt-1 text-slate-200">状态: {{ selectedAccount.status }}</p>
            <p class="mt-1 text-slate-200 break-all">本地文件: {{ selectedAccount.localFilePath || '-' }}</p>
            <p class="mt-1 text-slate-200 break-all">Token: {{ selectedAccount.ssoTokenPreview || '-' }}</p>
          </template>
          <p v-else class="mt-2 text-slate-500">还没有选中账号</p>
        </div>
      </aside>
    </div>
  </section>
</template>
