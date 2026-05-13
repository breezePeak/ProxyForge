<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useProxyServerStore } from '../stores/proxyServer';

const store = useProxyServerStore();
const copiedPath = ref('');
let copyTimer = null;
const expanded = ref(false);

const configForm = ref({
  port: store.port,
  host: store.host,
  requestTimeout: 120000,
  maxConcurrentPerAccount: 5
});

function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    copiedPath.value = label;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copiedPath.value = ''; }, 2000);
  }).catch(() => {});
}

function startServer() {
  if (window.desktop?.proxy?.start) {
    window.desktop.proxy.start().then(() => store.fetchStatus()).catch(() => {});
  }
}

function stopServer() {
  if (window.desktop?.proxy?.stop) {
    window.desktop.proxy.stop().then(() => store.fetchStatus()).catch(() => {});
  }
}

function saveConfig() {
  const newPort = parseInt(configForm.value.port, 10);
  if (newPort >= 1 && newPort <= 65535) {
    window.desktop?.proxy?.updateConfig(configForm.value).then(() => {
      store.port = newPort;
      store.host = configForm.value.host;
      expanded.value = false;
    }).catch(() => {});
  }
}

function resetConfig() {
  configForm.value = { port: store.port, host: store.host, requestTimeout: 120000, maxConcurrentPerAccount: 5 };
  expanded.value = false;
}

onMounted(() => {
  store.startPolling();
  configForm.value.port = store.port;
  configForm.value.host = store.host;
});

onUnmounted(() => {
  store.stopPolling();
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Status + Control -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <button
          v-if="!store.isRunning"
          @click="startServer"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
        >
          启动服务
        </button>
        <button
          v-else
          @click="stopServer"
          class="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
        >
          停止服务
        </button>
        <div class="flex items-center gap-2 text-sm text-slate-400">
          <span class="w-2 h-2 rounded-full" :class="store.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'" />
          <span>{{ store.isRunning ? '运行中' : '已停止' }}</span>
        </div>
      </div>

      <button
        @click="expanded = !expanded"
        class="p-2 rounded-lg hover:bg-slate-700/50 transition-colors"
        :title="expanded ? '收起配置' : '展开配置'"
      >
        <svg
          class="w-4 h-4 text-slate-400 transition-transform duration-200"
          :class="{ 'rotate-180': expanded }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    <!-- Connection URLs -->
    <div class="flex flex-wrap gap-2">
      <button
        @click="copyToClipboard(store.connectionString + '/chat/completions', 'openai')"
        class="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-colors group"
      >
        <span class="text-xs font-medium text-cyan-400">OpenAI</span>
        <code class="text-xs text-slate-300 font-mono">/chat/completions</code>
        <svg v-if="copiedPath !== 'openai'" class="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        <span v-else class="text-emerald-400 text-[10px] font-medium">✓</span>
      </button>

      <button
        @click="copyToClipboard(store.connectionString + '/messages', 'anthropic')"
        class="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-colors group"
      >
        <span class="text-xs font-medium text-cyan-400">Anthropic</span>
        <code class="text-xs text-slate-300 font-mono">/messages</code>
        <svg v-if="copiedPath !== 'anthropic'" class="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        <span v-else class="text-emerald-400 text-[10px] font-medium">✓</span>
      </button>

      <button
        @click="copyToClipboard(store.connectionString, 'base')"
        class="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-colors group"
      >
        <code class="text-xs text-slate-300 font-mono">{{ store.connectionString }}</code>
        <svg v-if="copiedPath !== 'base'" class="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        <span v-else class="text-emerald-400 text-[10px] font-medium">✓</span>
      </button>
    </div>

    <!-- Stats -->
    <div class="flex items-center gap-4 text-xs text-slate-500">
      <span>端口: <span class="text-slate-300">{{ store.port }}</span></span>
      <span>可用账号: <span class="text-slate-300">{{ store.activeAccounts }}</span></span>
      <span>请求数: <span class="text-slate-300">{{ store.requestCount }}</span></span>
    </div>

    <!-- Error -->
    <div v-if="store.error" class="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
      {{ store.error }}
    </div>

    <!-- Expanded: Configuration -->
    <div v-if="expanded" class="pt-4 border-t border-slate-700/50">
      <div class="grid grid-cols-2 gap-3 mb-4">
        <label class="grid gap-1">
          <span class="text-[10px] text-slate-500 uppercase tracking-wider">监听地址</span>
          <input v-model="configForm.host" type="text" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:border-cyan-500 focus:outline-none" placeholder="127.0.0.1" />
        </label>
        <label class="grid gap-1">
          <span class="text-[10px] text-slate-500 uppercase tracking-wider">端口</span>
          <input v-model.number="configForm.port" type="number" min="1" max="65535" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:border-cyan-500 focus:outline-none" placeholder="11434" />
        </label>
      </div>
      <div class="grid grid-cols-2 gap-3 mb-4">
        <label class="grid gap-1">
          <span class="text-[10px] text-slate-500 uppercase tracking-wider">请求超时 (ms)</span>
          <input v-model.number="configForm.requestTimeout" type="number" min="1000" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:border-cyan-500 focus:outline-none" placeholder="120000" />
        </label>
        <label class="grid gap-1">
          <span class="text-[10px] text-slate-500 uppercase tracking-wider">单账号最大并发</span>
          <input v-model.number="configForm.maxConcurrentPerAccount" type="number" min="1" max="50" class="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-sm focus:border-cyan-500 focus:outline-none" placeholder="5" />
        </label>
      </div>
      <div class="flex items-center gap-2">
        <button @click="saveConfig" class="px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 transition-colors">保存配置</button>
        <button @click="resetConfig" class="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">取消</button>
      </div>
    </div>
  </div>
</template>
