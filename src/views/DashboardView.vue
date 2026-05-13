<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAccountCenterStore } from '../stores/accountCenter';
import { useProxyServerStore } from '../stores/proxyServer';

const router = useRouter();
const center = useAccountCenterStore();
const proxyStore = useProxyServerStore();
const refreshingAll = ref(false);
const copiedPath = ref('');
let copyTimer = null;

function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    copiedPath.value = label;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copiedPath.value = ''; }, 2000);
  }).catch(() => {});
}


onMounted(async () => {
  await center.load();
  proxyStore.startPolling();
  refreshAllQuota();
});

onUnmounted(() => {
  proxyStore.stopPolling();
  if (copyTimer) clearTimeout(copyTimer);
});

watch(() => center.providers.map(p => ({ id: p.id, proxyEnabled: p.proxyEnabled })),
  (newProviders) => {
    if (window.desktop?.proxy?.setProviders) {
      window.desktop.proxy.setProviders(newProviders).catch(() => {});
    }
  },
  { deep: true }
);

function openProvider(id) {
  router.push({ name: 'provider-detail', params: { id } });
}

function toggleProviderProxy(provider, event) {
  event.stopPropagation();
  center.toggleProviderProxy(provider.id);
}

const displayName = (name) => name.replace(/账号/g, '池');

function getPoolStats(providerId) {
  const accounts = center.accountsByProvider[providerId] || [];
  const total = accounts.length;
  const normal = accounts.filter(a => a.status === 'success').length;
  const abnormal = total - normal;
  const totalQuota = accounts.reduce((sum, a) => sum + (a.quotaTotal || 0), 0);
  const usedQuota = accounts.reduce((sum, a) => sum + (a.quotaUsed || 0), 0);
  const availableQuota = totalQuota - usedQuota;
  const usagePercent = totalQuota > 0 ? Math.round((usedQuota / totalQuota) * 100) : 0;

  return { total, normal, abnormal, totalQuota, availableQuota, usagePercent };
}

function getGlobalStats() {
  let totalAccounts = 0, normalAccounts = 0, totalQuota = 0, usedQuota = 0;
  center.providers.forEach(p => {
    const accounts = center.accountsByProvider[p.id] || [];
    totalAccounts += accounts.length;
    normalAccounts += accounts.filter(a => a.status === 'success').length;
    accounts.forEach(a => {
      totalQuota += a.quotaTotal || 0;
      usedQuota += a.quotaUsed || 0;
    });
  });
  const abnormalAccounts = totalAccounts - normalAccounts;
  const availableQuota = totalQuota - usedQuota;
  const usagePercent = totalQuota > 0 ? Math.round((usedQuota / totalQuota) * 100) : 0;
  return { totalAccounts, normalAccounts, abnormalAccounts, totalQuota, availableQuota, usagePercent };
}

async function refreshAllQuota() {
  if (refreshingAll.value) return;
  refreshingAll.value = true;
  const allAccounts = [];
  center.providers.forEach(p => {
    (center.accountsByProvider[p.id] || []).forEach(a => allAccounts.push({ providerId: p.id, account: a }));
  });
  for (const { providerId, account } of allAccounts) {
    try { await center.refreshQuota(providerId, account.id); } catch (_e) {}
    await new Promise(r => setTimeout(r, 500));
  }
  refreshingAll.value = false;
}
</script>

<template>
  <section class="grid gap-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl font-bold text-slate-100">仪表盘</h1>
        <p class="mt-0.5 text-sm text-slate-400">管理你的账号池与 API 反代服务</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="refreshAllQuota"
          :disabled="refreshingAll"
          class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors disabled:opacity-50"
        >
          <svg class="w-4 h-4" :class="{ 'animate-spin': refreshingAll }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          刷新配额
        </button>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="rounded-xl bg-[#1a1d23] border border-slate-800/60 p-5">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        </div>
        <p class="text-2xl font-bold text-slate-100">{{ getGlobalStats().totalAccounts }}</p>
        <p class="text-xs text-slate-500 mt-1">总账号数</p>
      </div>

      <div class="rounded-xl bg-[#1a1d23] border border-slate-800/60 p-5">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <p class="text-2xl font-bold text-slate-100">{{ getGlobalStats().normalAccounts }}</p>
        <p class="text-xs text-slate-500 mt-1">正常账号</p>
      </div>

      <div class="rounded-xl bg-[#1a1d23] border border-slate-800/60 p-5">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
        </div>
        <p class="text-2xl font-bold text-slate-100">{{ getGlobalStats().abnormalAccounts }}</p>
        <p class="text-xs text-slate-500 mt-1">异常账号</p>
      </div>

      <div class="rounded-xl bg-[#1a1d23] border border-slate-800/60 p-5">
        <div class="flex items-center gap-2 mb-3">
          <div class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
        </div>
        <p class="text-2xl font-bold text-slate-100">{{ getGlobalStats().availableQuota }}</p>
        <p class="text-xs text-slate-500 mt-1">可用额度</p>
      </div>
    </div>

    <!-- Main Content: Two Columns -->
    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Left: Account Pools -->
      <div class="rounded-xl bg-[#1a1d23] border border-slate-800/60 p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-bold text-slate-100">账号池</h2>
          <span class="text-xs text-slate-500">{{ center.providers.length }} 个分组</span>
        </div>

        <div class="space-y-3">
          <button
            v-for="provider in center.providers"
            :key="provider.id"
            class="w-full rounded-lg bg-slate-800/40 border border-slate-700/50 p-4 text-left hover:border-slate-600/80 transition group"
            @click="openProvider(provider.id)"
          >
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span class="text-sm font-semibold text-slate-200">{{ displayName(provider.name) }}</span>
              </div>
              <button
                @click.stop="toggleProviderProxy(provider, $event)"
                class="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                :class="provider.proxyEnabled !== false
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'bg-red-500/15 text-red-400'"
              >
                <span class="w-1 h-1 rounded-full" :class="provider.proxyEnabled !== false ? 'bg-emerald-400' : 'bg-red-400'" />
                {{ provider.proxyEnabled !== false ? '反代开' : '反代关' }}
              </button>
            </div>

            <!-- Progress bar -->
            <div class="mb-2">
              <div class="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                <span>配额使用</span>
                <span>{{ getPoolStats(provider.id).usagePercent }}%</span>
              </div>
              <div class="h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="getPoolStats(provider.id).usagePercent > 80 ? 'bg-red-500' : getPoolStats(provider.id).usagePercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'"
                  :style="{ width: getPoolStats(provider.id).usagePercent + '%' }"
                />
              </div>
            </div>

            <div class="flex items-center gap-4 text-xs text-slate-400">
              <span>总 <span class="text-slate-200">{{ getPoolStats(provider.id).total }}</span></span>
              <span>正常 <span class="text-emerald-400">{{ getPoolStats(provider.id).normal }}</span></span>
              <span>异常 <span class="text-red-400">{{ getPoolStats(provider.id).abnormal }}</span></span>
              <span>可用 <span class="text-purple-400">{{ getPoolStats(provider.id).availableQuota }}</span></span>
            </div>
          </button>
        </div>
      </div>

      <!-- Right: Quick Proxy Panel -->
      <div class="rounded-xl bg-[#1a1d23] border border-slate-800/60 p-5">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-base font-bold text-slate-100">快速反代</h2>
          <button
            @click="router.push('/proxy')"
            class="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            完整配置 →
          </button>
        </div>

        <div class="flex flex-col gap-4">
          <!-- Start/Stop + Status -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <button
                v-if="!proxyStore.isRunning"
                @click="proxyStore.start()"
                class="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
              >
                启动服务
              </button>
              <button
                v-else
                @click="proxyStore.stop()"
                class="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
              >
                停止服务
              </button>
              <div class="flex items-center gap-2 text-sm text-slate-400">
                <span class="w-2 h-2 rounded-full" :class="proxyStore.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'" />
                <span>{{ proxyStore.isRunning ? '运行中' : '已停止' }}</span>
              </div>
            </div>
          </div>

          <!-- Copy URLs -->
          <div class="flex flex-wrap gap-2">
            <button
              @click="copyToClipboard(proxyStore.connectionString + '/chat/completions', 'openai')"
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
              @click="copyToClipboard(proxyStore.connectionString + '/messages', 'anthropic')"
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
              @click="copyToClipboard(proxyStore.connectionString, 'base')"
              class="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 transition-colors group"
            >
              <code class="text-xs text-slate-300 font-mono">{{ proxyStore.connectionString }}</code>
              <svg v-if="copiedPath !== 'base'" class="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
              <span v-else class="text-emerald-400 text-[10px] font-medium">✓</span>
            </button>
          </div>

          <!-- Stats -->
          <div class="flex items-center gap-4 text-xs text-slate-500">
            <span>端口: <span class="text-slate-300">{{ proxyStore.port }}</span></span>
            <span>可用账号: <span class="text-slate-300">{{ proxyStore.activeAccounts }}</span></span>
            <span>请求数: <span class="text-slate-300">{{ proxyStore.requestCount }}</span></span>
          </div>

          <!-- Error -->
          <div v-if="proxyStore.error" class="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
            {{ proxyStore.error }}
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
