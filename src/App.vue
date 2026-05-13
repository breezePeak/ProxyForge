<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const THEME_KEY = 'all2api-theme-mode-v1';
const router = useRouter();
const route = useRoute();
const themeMode = ref('dark');
const currentTheme = ref('dark');
const switching = ref(false);
const switchingTo = ref('dark');
const rippleX = ref('96vw');
const rippleY = ref('28px');

const navItems = [
  { name: 'dashboard', label: '仪表盘', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { name: 'provider-detail', label: '池管理', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { name: 'proxy', label: '反代中心', icon: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z' },
  { name: 'token-stats', label: 'Token 统计', icon: 'M13 10V3L4 14h7v7l9-11h-7z' }
];

function isActive(item) {
  return route.name === item.name;
}

function navigateTo(item) {
  if (item.name === 'provider-detail') {
    router.push({ name: 'provider-detail', params: { id: 'kiro' } });
  } else {
    router.push({ name: item.name });
  }
}

function resolveByTime() {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? 'light' : 'dark';
}

const resolvedTheme = computed(() => {
  if (themeMode.value === 'auto') return resolveByTime();
  return themeMode.value;
});

function applyThemeClass(theme) {
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
  currentTheme.value = theme === 'light' ? 'light' : 'dark';
}

function triggerTransition(nextTheme, event) {
  const target = event?.currentTarget;
  if (target?.getBoundingClientRect) {
    const rect = target.getBoundingClientRect();
    rippleX.value = `${rect.left + rect.width / 2}px`;
    rippleY.value = `${rect.top + rect.height / 2}px`;
  } else {
    rippleX.value = '96vw';
    rippleY.value = '28px';
  }

  switchingTo.value = nextTheme;
  switching.value = true;
  window.setTimeout(() => {
    applyThemeClass(nextTheme);
  }, 420);
  window.setTimeout(() => {
    switching.value = false;
  }, 760);
}

function setThemeMode(mode, event) {
  const nextResolved = mode === 'auto' ? resolveByTime() : mode;
  if (nextResolved !== currentTheme.value) {
    triggerTransition(nextResolved, event);
  }
  themeMode.value = mode;
  localStorage.setItem(THEME_KEY, mode);
}

onMounted(() => {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'auto' || saved === 'dark') {
    themeMode.value = saved;
  }
  applyThemeClass(resolvedTheme.value);

  window.setInterval(() => {
    if (themeMode.value === 'auto') {
      applyThemeClass(resolveByTime());
    }
  }, 60 * 1000);
});
</script>

<template>
  <div class="relative min-h-screen overflow-hidden" :class="currentTheme === 'light' ? 'theme-light' : 'theme-dark'">
    <!-- Cyber grid background -->
    <div class="pointer-events-none fixed inset-0 z-0">
      <div class="absolute inset-0 bg-[var(--bg-void)]" />
      <div class="absolute inset-0 opacity-30" style="background-image: linear-gradient(rgba(0,229,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.04) 1px, transparent 1px); background-size: 48px 48px;" />
      <div class="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-cyan-500/5 blur-[150px]" />
      <div class="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[150px]" />
    </div>

    <!-- Top Navigation Bar -->
    <header class="fixed inset-x-0 top-0 z-50 bg-[#0d0f14]/90 backdrop-blur-xl border-b border-slate-800/50">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <!-- Left: Logo + Nav -->
        <div class="flex items-center gap-6">
          <span class="text-base font-bold text-slate-100 cursor-pointer" @click="router.push('/')">ProxyForge</span>
          <nav class="flex items-center gap-1 rounded-lg bg-slate-800/50 p-1">
            <button
              v-for="item in navItems"
              :key="item.name"
              @click="navigateTo(item)"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="isActive(item)
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'"
            >
              <svg v-if="item.icon" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="item.icon" />
              </svg>
              {{ item.label }}
            </button>
          </nav>
        </div>

        <!-- Right: Theme toggle -->
        <div class="flex items-center gap-2">
          <button
            @click="setThemeMode(currentTheme === 'dark' ? 'light' : 'dark', $event)"
            class="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            title="切换主题"
          >
            <svg v-if="currentTheme === 'dark'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Main content -->
    <main class="relative z-10 mx-auto max-w-7xl px-6 pt-20 pb-8">
      <RouterView />
    </main>

    <div
      v-if="switching"
      class="theme-switch-overlay"
      :class="switchingTo === 'light' ? 'theme-switch-light' : 'theme-switch-dark'"
      :style="{ '--ripple-x': rippleX, '--ripple-y': rippleY }"
    />
  </div>
</template>
