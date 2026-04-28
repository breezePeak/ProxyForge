<script setup>
import { nextTick, onMounted, reactive, ref, watch } from 'vue';

const form = reactive({
  url: 'https://app.kiro.dev',
  usernamePrefix: 'demo_',
  fullName: '',
  emailDomain: 'example.com',
  password: '',
  count: 1,
  headless: false,
  stopOnError: true,
  fingerprintEnabled: false,
  fingerprintType: 'random',
  retryMax: 3,
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
const logPanelRef = ref(null);

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

function scrollLogToBottom() {
  nextTick(() => {
    const panel = logPanelRef.value;
    if (panel) {
      panel.scrollTop = panel.scrollHeight;
    }
  });
}

watch(() => logs.value.length, scrollLogToBottom);

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
    <div class="app-card command-shell p-6">
      <h1 class="app-title text-2xl">Kiro 自动注册改号</h1>
      <p class="mt-2 app-copy text-sm">先配置注册页面和选择器，再批量生成新账号。请只在你有权限的网站使用。</p>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <label class="control-label">
          <span class="">注册页 URL</span>
          <input v-model="form.url" class="control-input " placeholder="https://example.com/signup" />
        </label>

        <label class="control-label">
          <span class="">默认密码</span>
          <input v-model="form.password" type="password" class="control-input " placeholder="请输入统一密码" />
        </label>

        <label class="control-label">
          <span class="">用户名前缀</span>
          <input v-model="form.usernamePrefix" class="control-input " placeholder="demo_" />
        </label>

        <label class="control-label">
          <span class="">注册姓名 / 页面用户名</span>
          <input v-model="form.fullName" class="control-input " placeholder="可填英文或中文，例如 Alex Chen / 张三" />
        </label>

        <label class="control-label">
          <span class="">邮箱域名</span>
          <input v-model="form.emailDomain" class="control-input " placeholder="example.com" />
        </label>

        <label class="control-label">
          <span class="">注册数量</span>
          <input v-model.number="form.count" type="number" min="1" max="50" class="control-input " />
        </label>

        <label class="control-label">
          <span class="">失败刷新重试次数</span>
          <input v-model.number="form.retryMax" type="number" min="0" max="10" class="control-input " />
        </label>

        <label class="control-label">
          <span class="">指纹类型</span>
          <select v-model="form.fingerprintType" :disabled="!form.fingerprintEnabled" class="control-input  disabled:cursor-not-allowed disabled:opacity-50">
            <option value="random">random（随机）</option>
            <option value="windows_chrome">windows_chrome</option>
            <option value="mac_chrome">mac_chrome</option>
            <option value="linux_chrome">linux_chrome</option>
          </select>
        </label>

        <div class="control-label pt-1">
          <label class="flex items-center gap-2 "><input v-model="form.fingerprintEnabled" type="checkbox" />启用浏览器指纹</label>
          <label class="flex items-center gap-2 "><input v-model="form.headless" type="checkbox" />无头模式</label>
          <label class="flex items-center gap-2 "><input v-model="form.stopOnError" type="checkbox" />出错即停</label>
        </div>
      </div>

      <div class="mt-6 app-card-strong p-4">
        <h2 class="text-base font-black" style="color: var(--app-text);">Kiro 流程（Cookie 授权链路）</h2>
        <p class="mt-1 app-muted text-xs">
          流程参考 kiro-auto：处理 Cookie 弹窗 -> 轮询授权 Cookie -> 连续稳定后判定完成。
        </p>
        <div class="mt-3 grid gap-3 md:grid-cols-3">
          <label class="flex items-center gap-2 app-copy text-sm">
            <input v-model="form.kiroFlow.enabled" type="checkbox" />
            启用 Kiro Cookie 流程
          </label>
          <label class="control-label">
            <span class="">Cookie 名称</span>
            <input v-model="form.kiroFlow.cookieName" class="control-input " />
          </label>
          <label class="control-label">
            <span class="">稳定秒数</span>
            <input v-model.number="form.kiroFlow.stableSeconds" type="number" min="3" max="60" class="control-input " />
          </label>
          <label class="control-label md:col-span-1">
            <span class="">最大等待秒数</span>
            <input v-model.number="form.kiroFlow.maxWaitSeconds" type="number" min="10" max="300" class="control-input " />
          </label>
        </div>
      </div>

      <div class="mt-6">
        <h2 class="text-base font-black" style="color: var(--app-text);">选择器配置</h2>
        <div class="mt-3 grid gap-4 md:grid-cols-2">
          <label class="control-label"><span class="">用户名/姓名输入框</span><input v-model="form.selectors.username" class="control-input " placeholder="#username 或 input[name='name']" /></label>
          <label class="control-label"><span class="">邮箱输入框</span><input v-model="form.selectors.email" class="control-input " placeholder="#email" /></label>
          <label class="control-label"><span class="">密码输入框</span><input v-model="form.selectors.password" class="control-input " placeholder="#password" /></label>
          <label class="control-label"><span class="">确认密码输入框</span><input v-model="form.selectors.confirmPassword" class="control-input " placeholder="#confirm-password" /></label>
          <label class="control-label"><span class="">提交按钮</span><input v-model="form.selectors.submit" class="control-input " placeholder="button[type='submit']" /></label>
          <label class="control-label"><span class="">成功标记（可选）</span><input v-model="form.selectors.success" class="control-input " placeholder=".signup-success" /></label>
        </div>
      </div>

      <div class="mt-6 flex items-center gap-3">
        <button class="app-button-primary disabled:cursor-not-allowed" :disabled="running" @click="runTask">
          {{ running ? '执行中...' : '开始自动注册' }}
        </button>
        <p v-if="errorText" class="status-danger text-sm">{{ errorText }}</p>
      </div>
    </div>

    <div class="app-card p-6">
      <h2 class="text-base font-black" style="color: var(--app-text);">邮箱接码工具（提取自 kiro-auto）</h2>
      <div class="mt-3 grid gap-4 md:grid-cols-2">
        <label class="control-label">
          <span class="">邮箱服务</span>
          <select v-model="mailbox.providerId" class="control-input ">
            <option v-for="p in providerList" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </label>
        <div class="flex items-end gap-2">
          <button class="app-button-secondary disabled:cursor-not-allowed" :disabled="mailbox.loadingProviders" @click="loadProviders">
            刷新服务
          </button>
          <button class="app-button-primary disabled:cursor-not-allowed" :disabled="mailbox.creating" @click="createMailbox">
            {{ mailbox.creating ? '创建中...' : '创建邮箱' }}
          </button>
        </div>

        <label class="control-label"><span class="">邮箱地址</span><input v-model="mailbox.email" class="control-input " placeholder="创建后自动填充" /></label>
        <label class="control-label"><span class="">令牌 token</span><input v-model="mailbox.token" class="control-input " placeholder="创建后自动填充" /></label>

        <label class="control-label"><span class="">超时（秒）</span><input v-model.number="mailbox.timeoutSec" type="number" min="10" max="600" class="control-input " /></label>
        <label class="control-label"><span class="">轮询间隔（毫秒）</span><input v-model.number="mailbox.intervalMs" type="number" min="2000" max="10000" step="500" class="control-input " /></label>
      </div>

      <div class="mt-4 flex items-center gap-3">
        <button class="app-button-primary disabled:cursor-not-allowed" :disabled="mailbox.waiting" @click="waitCode">
          {{ mailbox.waiting ? '等待中...' : '开始接码' }}
        </button>
        <p v-if="mailbox.code" class="status-success text-sm">验证码: {{ mailbox.code }}</p>
      </div>

      <p v-if="mailbox.message" class="mt-2 app-copy text-sm">{{ mailbox.message }}</p>
      <p v-if="mailbox.error" class="mt-2 status-danger text-sm">{{ mailbox.error }}</p>
    </div>

    <div class="app-card p-6">
      <h2 class="text-base font-black" style="color: var(--app-text);">执行日志</h2>
      <div ref="logPanelRef" class="log-panel mt-3 max-h-56">
        <p v-if="logs.length === 0">暂无日志</p>
        <p v-for="(line, idx) in logs" :key="idx">{{ line }}</p>
      </div>
    </div>

    <div class="app-card p-6">
      <h2 class="text-base font-black" style="color: var(--app-text);">结果列表</h2>
      <div class="app-card-strong mt-3 overflow-auto p-3 text-xs">
        <table class="w-full table-auto text-left">
          <thead>
            <tr class="app-muted">
              <th class="px-2 py-1">序号</th>
              <th class="px-2 py-1">账号</th>
              <th class="px-2 py-1">邮箱</th>
              <th class="px-2 py-1">状态</th>
              <th class="px-2 py-1">Kiro Cookie</th>
              <th class="px-2 py-1">错误</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in results" :key="item.index" class="border-t" style="border-color: var(--app-border);">
              <td class="px-2 py-1">{{ item.index }}</td>
              <td class="px-2 py-1">{{ item.account.username }}</td>
              <td class="px-2 py-1">{{ item.account.email }}</td>
              <td class="px-2 py-1" :class="item.status === 'success' ? 'status-success' : 'status-danger'">{{ item.status }}</td>
              <td class="px-2 py-1">{{ item.ssoTokenPreview || '-' }}</td>
              <td class="px-2 py-1">{{ item.error || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
