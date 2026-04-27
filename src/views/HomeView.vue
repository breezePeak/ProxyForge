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
    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-cyan-950/20">
      <h1 class="text-2xl font-bold text-white">Kiro 自动注册改号</h1>
      <p class="mt-2 text-sm text-slate-300">先配置注册页面和选择器，再批量生成新账号。请只在你有权限的网站使用。</p>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <label class="grid gap-2 text-sm">
          <span class="text-slate-300">注册页 URL</span>
          <input v-model="form.url" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="https://example.com/signup" />
        </label>

        <label class="grid gap-2 text-sm">
          <span class="text-slate-300">默认密码</span>
          <input v-model="form.password" type="password" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="请输入统一密码" />
        </label>

        <label class="grid gap-2 text-sm">
          <span class="text-slate-300">用户名前缀</span>
          <input v-model="form.usernamePrefix" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="demo_" />
        </label>

        <label class="grid gap-2 text-sm">
          <span class="text-slate-300">邮箱域名</span>
          <input v-model="form.emailDomain" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="example.com" />
        </label>

        <label class="grid gap-2 text-sm">
          <span class="text-slate-300">注册数量</span>
          <input v-model.number="form.count" type="number" min="1" max="50" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
        </label>

        <label class="grid gap-2 text-sm">
          <span class="text-slate-300">指纹类型</span>
          <select v-model="form.fingerprintType" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
            <option value="none">none（不覆盖）</option>
            <option value="random">random（随机）</option>
            <option value="windows_chrome">windows_chrome</option>
            <option value="mac_chrome">mac_chrome</option>
            <option value="linux_chrome">linux_chrome</option>
          </select>
        </label>

        <div class="grid gap-2 text-sm pt-1">
          <label class="flex items-center gap-2 text-slate-300"><input v-model="form.headless" type="checkbox" />无头模式</label>
          <label class="flex items-center gap-2 text-slate-300"><input v-model="form.stopOnError" type="checkbox" />出错即停</label>
        </div>
      </div>

      <div class="mt-6 rounded-xl border border-cyan-900/40 bg-slate-950/60 p-4">
        <h2 class="text-base font-semibold text-cyan-300">Kiro 流程（Cookie 授权链路）</h2>
        <p class="mt-1 text-xs text-slate-400">
          流程参考 kiro-auto：处理 Cookie 弹窗 -> 轮询授权 Cookie -> 连续稳定后判定完成。
        </p>
        <div class="mt-3 grid gap-3 md:grid-cols-3">
          <label class="flex items-center gap-2 text-sm text-slate-300">
            <input v-model="form.kiroFlow.enabled" type="checkbox" />
            启用 Kiro Cookie 流程
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-slate-300">Cookie 名称</span>
            <input v-model="form.kiroFlow.cookieName" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label class="grid gap-1 text-sm">
            <span class="text-slate-300">稳定秒数</span>
            <input v-model.number="form.kiroFlow.stableSeconds" type="number" min="3" max="60" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
          <label class="grid gap-1 text-sm md:col-span-1">
            <span class="text-slate-300">最大等待秒数</span>
            <input v-model.number="form.kiroFlow.maxWaitSeconds" type="number" min="10" max="300" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" />
          </label>
        </div>
      </div>

      <div class="mt-6">
        <h2 class="text-base font-semibold text-cyan-300">选择器配置</h2>
        <div class="mt-3 grid gap-4 md:grid-cols-2">
          <label class="grid gap-2 text-sm"><span class="text-slate-300">用户名输入框</span><input v-model="form.selectors.username" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="#username" /></label>
          <label class="grid gap-2 text-sm"><span class="text-slate-300">邮箱输入框</span><input v-model="form.selectors.email" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="#email" /></label>
          <label class="grid gap-2 text-sm"><span class="text-slate-300">密码输入框</span><input v-model="form.selectors.password" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="#password" /></label>
          <label class="grid gap-2 text-sm"><span class="text-slate-300">确认密码输入框</span><input v-model="form.selectors.confirmPassword" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="#confirm-password" /></label>
          <label class="grid gap-2 text-sm"><span class="text-slate-300">提交按钮</span><input v-model="form.selectors.submit" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="button[type='submit']" /></label>
          <label class="grid gap-2 text-sm"><span class="text-slate-300">成功标记（可选）</span><input v-model="form.selectors.success" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder=".signup-success" /></label>
        </div>
      </div>

      <div class="mt-6 flex items-center gap-3">
        <button class="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600" :disabled="running" @click="runTask">
          {{ running ? '执行中...' : '开始自动注册' }}
        </button>
        <p v-if="errorText" class="text-sm text-rose-300">{{ errorText }}</p>
      </div>
    </div>

    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 class="text-base font-semibold text-cyan-300">邮箱接码工具（提取自 kiro-auto）</h2>
      <div class="mt-3 grid gap-4 md:grid-cols-2">
        <label class="grid gap-2 text-sm">
          <span class="text-slate-300">邮箱服务</span>
          <select v-model="mailbox.providerId" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100">
            <option v-for="p in providerList" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <div class="flex items-end gap-2">
          <button class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600" :disabled="mailbox.loadingProviders" @click="loadProviders">
            刷新服务
          </button>
          <button class="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600" :disabled="mailbox.creating" @click="createMailbox">
            {{ mailbox.creating ? '创建中...' : '创建邮箱' }}
          </button>
        </div>

        <label class="grid gap-2 text-sm"><span class="text-slate-300">邮箱地址</span><input v-model="mailbox.email" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="创建后自动填充" /></label>
        <label class="grid gap-2 text-sm"><span class="text-slate-300">令牌 token</span><input v-model="mailbox.token" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" placeholder="创建后自动填充" /></label>

        <label class="grid gap-2 text-sm"><span class="text-slate-300">超时（秒）</span><input v-model.number="mailbox.timeoutSec" type="number" min="10" max="600" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" /></label>
        <label class="grid gap-2 text-sm"><span class="text-slate-300">轮询间隔（毫秒）</span><input v-model.number="mailbox.intervalMs" type="number" min="2000" max="10000" step="500" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100" /></label>
      </div>

      <div class="mt-4 flex items-center gap-3">
        <button class="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-600" :disabled="mailbox.waiting" @click="waitCode">
          {{ mailbox.waiting ? '等待中...' : '开始接码' }}
        </button>
        <p v-if="mailbox.code" class="text-sm text-emerald-300">验证码: {{ mailbox.code }}</p>
      </div>

      <p v-if="mailbox.message" class="mt-2 text-sm text-slate-300">{{ mailbox.message }}</p>
      <p v-if="mailbox.error" class="mt-2 text-sm text-rose-300">{{ mailbox.error }}</p>
    </div>

    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 class="text-base font-semibold text-cyan-300">执行日志</h2>
      <div class="mt-3 max-h-56 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
        <p v-if="logs.length === 0">暂无日志</p>
        <p v-for="(line, idx) in logs" :key="idx">{{ line }}</p>
      </div>
    </div>

    <div class="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 class="text-base font-semibold text-cyan-300">结果列表</h2>
      <div class="mt-3 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-300">
        <table class="w-full table-auto text-left">
          <thead>
            <tr class="text-slate-400">
              <th class="px-2 py-1">序号</th>
              <th class="px-2 py-1">账号</th>
              <th class="px-2 py-1">邮箱</th>
              <th class="px-2 py-1">状态</th>
              <th class="px-2 py-1">Kiro Cookie</th>
              <th class="px-2 py-1">错误</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in results" :key="item.index" class="border-t border-slate-800">
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
