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

    <!-- Header -->
    <header class="fixed inset-x-0 top-0 z-50 bg-[#060810]/85 backdrop-blur-xl border-b border-cyan-500/10">
      <div class="mx-auto flex h-14 max-w-7xl items-center px-6">
        <span class="neon-text-mixed text-base font-bold tracking-wider cursor-pointer" @click="router.push('/')">ProxyForge</span>
      </div>
      <!-- Scanline overlay -->
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />
    </header>

    <!-- Main content -->
    <main class="relative z-10 mx-auto max-w-7xl px-6 py-20">
      <RouterView />
    </main>

    <!-- Footer -->
    <footer class="relative z-10 mx-auto max-w-7xl px-6 pb-8 pt-16 text-center">
      <div class="neon-divider mb-4" />
      <p class="text-xs text-slate-600">ProxyForge · v0.1.0 · Cyber Edition</p>
    </footer>

    <div
      v-if="switching"
      class="theme-switch-overlay"
      :class="switchingTo === 'light' ? 'theme-switch-light' : 'theme-switch-dark'"
      :style="{ '--ripple-x': rippleX, '--ripple-y': rippleY }"
    />
  </div>
</template>
