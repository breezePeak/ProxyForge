<script setup>
import { onMounted, reactive, ref } from 'vue';

const form = reactive({
  url: 'https://app.kiro.dev',
  usernamePrefix: 'demo_',
  emailDomain: 'example.com',
  password: '',
  count: 1,
  headless: false,
  stopOnError: true,
  fingerprintType: 'none',
  kiroFlow: {
    enabled: true,
    cookieName: 'x-amz-sso_authn',
    stableSeconds: 15,
    maxWaitSeconds: 90
  },
  selectors: {
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    submit: '',
    success: ''
  }
});

const running = ref(false);
const logs = ref([]);
const results = ref([]);
const errorText = ref('');

const providerList = ref([]);
const mailbox = reactive({
  providerId: 'tempmail_lol',
  email: '',
  token: '',
  timeoutSec: 120,
  intervalMs: 3000,
  code: '',
  message: '',
  loadingProviders: false,
  creating: false,
  waiting: false,
  error: ''
});

async function runTask() {
  errorText.value = '';
  logs.value = [];

  if (!window.desktop?.automation?.registerBatch) {
    errorText.value = '自动化接口未就绪，请用 Electron 模式启动。';
    return;
  }

  running.value = true;
  try {
    const resp = await window.desktop.automation.registerBatch(form);
    logs.value = resp.logs || [];
    results.value = resp.results || [];
  } catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error);
  } finally {
    running.value = false;
  }
}

async function loadProviders() {
  mailbox.loadingProviders = true;
  mailbox.error = '';
  try {
    const list = await window.desktop?.mailbox?.listProviders?.();
    providerList.value = Array.isArray(list) ? list : [];
    if (providerList.value.length > 0 && !providerList.value.find((p) => p.id === mailbox.providerId)) {
      mailbox.providerId = providerList.value[0].id;
    }
  } catch (error) {
    mailbox.error = error instanceof Error ? error.message : String(error);
  } finally {
    mailbox.loadingProviders = false;
  }
}

async function createMailbox() {
  mailbox.error = '';
  mailbox.code = '';
  mailbox.message = '';
  mailbox.creating = true;
  try {
    const data = await window.desktop?.mailbox?.create?.({ providerId: mailbox.providerId });
    mailbox.email = data?.email || '';
    mailbox.token = data?.token || '';
    mailbox.message = mailbox.email ? `已创建邮箱: ${mailbox.email}` : '';
  } catch (error) {
    mailbox.error = error instanceof Error ? error.message : String(error);
  } finally {
    mailbox.creating = false;
  }
}

async function waitCode() {
  mailbox.error = '';
  mailbox.code = '';
  mailbox.message = '';
  mailbox.waiting = true;
  try {
    const data = await window.desktop?.mailbox?.waitCode?.({
      providerId: mailbox.providerId,
      email: mailbox.email,
      token: mailbox.token,
      timeoutSec: mailbox.timeoutSec,
      intervalMs: mailbox.intervalMs
    });

    if (data?.ok && data?.code) {
      mailbox.code = data.code;
      mailbox.message = `已匹配验证码，发件人: ${data?.matchedMessage?.from || '未知'}`;
    } else {
      mailbox.message = data?.message || '未找到验证码';
    }
  } catch (error) {
    mailbox.error = error instanceof Error ? error.message : String(error);
  } finally {
    mailbox.waiting = false;
  }
}

onMounted(() => {
  loadProviders();
});
</script>

<template>
  <section class="grid gap-6">
    <!-- Header -->
    <div class="neon-card p-6">
      <h1 class="neon-text-cyan text-2xl font-black">kiro auto register</h1>
      <p class="mt-2 text-sm text-slate-400">先配置注册页面和选择器，再批量生成新账号。请只在你有权限的网站使用。</p>
    </div>

    <!-- Form Fields -->
    <div class="neon-card p-6">
      <div class="grid gap-5 md:grid-cols-2">
        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">注册页 URL</span>
          <input v-model="form.url" class="neon-input" placeholder="https://example.com/signup" />
        </label>

        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">默认密码</span>
          <input v-model="form.password" type="password" class="neon-input" placeholder="请输入统一密码" />
        </label>

        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">用户名前缀</span>
          <input v-model="form.usernamePrefix" class="neon-input" placeholder="demo_" />
        </label>

        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">邮箱域名</span>
          <input v-model="form.emailDomain" class="neon-input" placeholder="example.com" />
        </label>

        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">注册数量</span>
          <input v-model.number="form.count" type="number" min="1" max="50" class="neon-input" />
        </label>

        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">指纹类型</span>
          <select v-model="form.fingerprintType" class="neon-input">
            <option value="none">none（不覆盖）</option>
            <option value="random">random（随机）</option>
            <option value="windows_chrome">windows_chrome</option>
            <option value="mac_chrome">mac_chrome</option>
            <option value="linux_chrome">linux_chrome</option>
          </select>
        </label>

        <div class="grid gap-2 text-sm pt-1 md:col-span-2">
          <label class="flex items-center gap-2 text-slate-400"><input v-model="form.headless" type="checkbox" class="accent-cyan-400" />无头模式</label>
          <label class="flex items-center gap-2 text-slate-400"><input v-model="form.stopOnError" type="checkbox" class="accent-cyan-400" />出错即停</label>
        </div>
      </div>

      <!-- Kiro Flow -->
      <div class="mt-6 neon-card p-4">
        <h2 class="text-base font-semibold neon-text-cyan">Kiro 流程（Cookie 授权链路）</h2>
        <p class="mt-1 text-xs text-slate-500">
          流程参考 kiro-auto：处理 Cookie 弹窗 -> 轮询授权 Cookie -> 连续稳定后判定完成。
        </p>
        <div class="mt-3 grid gap-3 md:grid-cols-3">
          <label class="flex items-center gap-2 text-sm text-slate-400">
            <input v-model="form.kiroFlow.enabled" type="checkbox" class="accent-cyan-400" />
            启用 Kiro Cookie 流程
          </label>
          <label class="grid gap-1.5">
            <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">Cookie 名称</span>
            <input v-model="form.kiroFlow.cookieName" class="neon-input" />
          </label>
          <label class="grid gap-1.5">
            <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">稳定秒数</span>
            <input v-model.number="form.kiroFlow.stableSeconds" type="number" min="3" max="60" class="neon-input" />
          </label>
          <label class="grid gap-1.5 md:col-span-1">
            <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">最大等待秒数</span>
            <input v-model.number="form.kiroFlow.maxWaitSeconds" type="number" min="10" max="300" class="neon-input" />
          </label>
        </div>
      </div>

      <!-- Selectors -->
      <div class="mt-6">
        <h2 class="text-base font-semibold neon-text-cyan">选择器配置</h2>
        <div class="mt-3 grid gap-4 md:grid-cols-2">
          <label class="grid gap-1.5"><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">用户名输入框</span><input v-model="form.selectors.username" class="neon-input" placeholder="#username" /></label>
          <label class="grid gap-1.5"><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">邮箱输入框</span><input v-model="form.selectors.email" class="neon-input" placeholder="#email" /></label>
          <label class="grid gap-1.5"><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">密码输入框</span><input v-model="form.selectors.password" class="neon-input" placeholder="#password" /></label>
          <label class="grid gap-1.5"><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">确认密码输入框</span><input v-model="form.selectors.confirmPassword" class="neon-input" placeholder="#confirm-password" /></label>
          <label class="grid gap-1.5"><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">提交按钮</span><input v-model="form.selectors.submit" class="neon-input" placeholder="button[type='submit']" /></label>
          <label class="grid gap-1.5"><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">成功标记（可选）</span><input v-model="form.selectors.success" class="neon-input" placeholder=".signup-success" /></label>
        </div>
      </div>

      <!-- Run Button -->
      <div class="mt-6 flex items-center gap-3">
        <button :disabled="running" @click="runTask" class="neon-btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
          {{ running ? 'Running...' : 'Start Registration' }}
        </button>
        <p v-if="errorText" class="text-sm text-rose-300">{{ errorText }}</p>
      </div>
    </div>

    <!-- Mailbox Tool -->
    <div class="neon-card p-6">
      <h2 class="text-base font-semibold neon-text-cyan">邮箱接码工具（提取自 kiro-auto）</h2>
      <div class="mt-3 grid gap-4 md:grid-cols-2">
        <label class="grid gap-1.5">
          <span class="text-xs font-medium text-slate-400 uppercase tracking-wider">邮箱服务</span>
          <select v-model="mailbox.providerId" class="neon-input">
            <option v-for="p in providerList" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <div class="flex items-end gap-2">
          <button :disabled="mailbox.loadingProviders" @click="loadProviders" class="neon-btn disabled:opacity-40 disabled:cursor-not-allowed">
            刷新服务
          </button>
          <button :disabled="mailbox.creating" @click="createMailbox" class="neon-btn disabled:opacity-40 disabled:cursor-not-allowed">
            {{ mailbox.creating ? '创建中...' : '创建邮箱' }}
          </button>
        </div>

        <label class="grid gap-1.5"><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">邮箱地址</span><input v-model="mailbox.email" class="neon-input" placeholder="创建后自动填充" /></label>
        <label class="grid gap-1.5"><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">令牌 token</span><input v-model="mailbox.token" class="neon-input" placeholder="创建后自动填充" /></label>

        <label class="grid gap-1.5"><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">超时（秒）</span><input v-model.number="mailbox.timeoutSec" type="number" min="10" max="600" class="neon-input" /></label>
        <label class="grid gap-1.5"><span class="text-xs font-medium text-slate-400 uppercase tracking-wider">轮询间隔（毫秒）</span><input v-model.number="mailbox.intervalMs" type="number" min="2000" max="10000" step="500" class="neon-input" /></label>
      </div>

      <div class="mt-4 flex items-center gap-3">
        <button :disabled="mailbox.waiting" @click="waitCode" class="neon-btn disabled:opacity-40 disabled:cursor-not-allowed">
          {{ mailbox.waiting ? '等待中...' : '开始接码' }}
        </button>
        <p v-if="mailbox.code" class="text-sm text-emerald-300">验证码: {{ mailbox.code }}</p>
      </div>

      <p v-if="mailbox.message" class="mt-2 text-sm text-slate-400">{{ mailbox.message }}</p>
      <p v-if="mailbox.error" class="mt-2 text-sm text-rose-300">{{ mailbox.error }}</p>
    </div>

    <!-- Logs -->
    <div class="neon-card p-6">
      <h2 class="text-base font-semibold neon-text-cyan">执行日志</h2>
      <div class="mt-3 max-h-56 overflow-auto rounded-lg bg-[#05070a]/60 border border-slate-800/60 p-3 text-xs text-slate-400">
        <p v-if="logs.length === 0">暂无日志</p>
        <p v-for="(line, idx) in logs" :key="idx">{{ line }}</p>
      </div>
    </div>

    <!-- Results -->
    <div class="neon-card p-6">
      <h2 class="text-base font-semibold neon-text-cyan">结果列表</h2>
      <div class="mt-3 overflow-auto rounded-lg bg-[#05070a]/60 border border-slate-800/60 p-3 text-xs text-slate-400">
        <table class="w-full table-auto text-left">
          <thead>
            <tr class="text-slate-500">
              <th class="px-2 py-1">序号</th>
              <th class="px-2 py-1">账号</th>
              <th class="px-2 py-1">邮箱</th>
              <th class="px-2 py-1">状态</th>
              <th class="px-2 py-1">Kiro Cookie</th>
              <th class="px-2 py-1">错误</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in results" :key="item.index" class="border-t border-slate-800/60">
              <td class="px-2 py-1">{{ item.index }}</td>
              <td class="px-2 py-1">{{ item.account.username }}</td>
              <td class="px-2 py-1">{{ item.account.email }}</td>
              <td class="px-2 py-1" :class="item.status === 'success' ? 'text-emerald-300' : 'text-rose-300'">{{ item.status }}</td>
              <td class="px-2 py-1">{{ item.ssoTokenPreview || '-' }}</td>
              <td class="px-2 py-1">{{ item.error || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
