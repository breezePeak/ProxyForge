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
  <div class="app-shell" :class="currentTheme === 'light' ? 'theme-light' : 'theme-dark'">
    <div class="pointer-events-none absolute inset-0 opacity-90">
      <div class="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
      <div class="app-orb left-[-10rem] top-20 h-96 w-96 bg-teal-400/20" />
      <div class="app-orb right-[-6rem] top-8 h-80 w-80 bg-amber-400/20" />
      <div class="app-orb bottom-[-12rem] left-1/4 h-96 w-96 bg-cyan-400/20" />
    </div>

    <header class="app-nav">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <button
          class="group flex cursor-pointer items-center gap-3 rounded-2xl text-left transition hover:opacity-90"
          @click="router.push('/')"
        >
          <span class="flex h-9 w-9 items-center justify-center rounded-2xl border text-sm font-black" style="border-color: var(--app-border-strong); background: color-mix(in srgb, var(--app-primary) 12%, transparent); color: var(--app-primary);">
            A
          </span>
          <span>
            <span class="font-mono-brand block bg-gradient-to-r from-teal-300 via-cyan-200 to-amber-200 bg-clip-text text-sm font-bold tracking-[0.22em] text-transparent">All2API</span>
            <span class="app-muted block text-[10px] uppercase tracking-[0.24em]">Account Automation Console</span>
          </span>
        </button>
        <div class="flex items-center gap-2">
          <button
            class="cursor-pointer rounded-xl border px-2 py-1 text-xs transition"
            :class="themeMode === 'light' ? 'border-teal-400/60 bg-teal-400/15 text-teal-200' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-teal-400/50'"
            title="白天模式"
            @click="setThemeMode('light', $event)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          </button>
          <button
            class="cursor-pointer rounded-xl border px-2 py-1 text-xs transition"
            :class="themeMode === 'auto' ? 'border-teal-400/60 bg-teal-400/15 text-teal-200' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-teal-400/50'"
            title="自动模式"
            @click="setThemeMode('auto', $event)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6l4 2" />
            </svg>
          </button>
          <button
            class="cursor-pointer rounded-xl border px-2 py-1 text-xs transition"
            :class="themeMode === 'dark' ? 'border-teal-400/60 bg-teal-400/15 text-teal-200' : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-teal-400/50'"
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

    <main class="relative mx-auto max-w-7xl px-4 pb-8 pt-28">
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
