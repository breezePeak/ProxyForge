<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

const THEME_KEY = 'all2api-theme-mode-v1';
const router = useRouter();
const themeMode = ref('dark');
const currentTheme = ref('dark');
const switching = ref(false);
const switchingTo = ref('dark');
const rippleX = ref('96vw');
const rippleY = ref('28px');

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
    <div class="pointer-events-none absolute inset-0 opacity-70">
      <div class="absolute left-[-12rem] top-[-10rem] h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />
      <div class="absolute right-[-8rem] top-10 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
      <div class="absolute bottom-[-10rem] left-1/3 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
    </div>

    <header class="fixed inset-x-0 top-0 z-50 border-b border-slate-700/70 bg-slate-900/65 backdrop-blur-xl">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <button
          class="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-sm font-semibold tracking-wide text-transparent transition hover:opacity-80"
          @click="router.push('/')"
        >
          All2API Account Center
        </button>
        <div class="flex items-center gap-2">
          <button
            class="rounded-md border px-2 py-1 text-xs transition"
            :class="themeMode === 'light' ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-600 bg-slate-900/45 text-slate-200 hover:border-cyan-500'"
            title="白天模式"
            @click="setThemeMode('light', $event)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </button>
          <button
            class="rounded-md border px-2 py-1 text-xs transition"
            :class="themeMode === 'auto' ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-600 bg-slate-900/45 text-slate-200 hover:border-cyan-500'"
            title="自动模式"
            @click="setThemeMode('auto', $event)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6l4 2" />
            </svg>
          </button>
          <button
            class="rounded-md border px-2 py-1 text-xs transition"
            :class="themeMode === 'dark' ? 'border-cyan-500 bg-cyan-500/15 text-cyan-200' : 'border-slate-600 bg-slate-900/45 text-slate-200 hover:border-cyan-500'"
            title="黑夜模式"
            @click="setThemeMode('dark', $event)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <main class="relative mx-auto max-w-7xl px-4 pb-8 pt-24">
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
