<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAccountCenterStore } from '../stores/accountCenter';

const router = useRouter();
const center = useAccountCenterStore();

onMounted(() => {
  center.load();
});

function openProvider(id) {
  router.push({ name: 'provider-detail', params: { id } });
}
</script>

<template>
  <section class="grid gap-6">
    <div class="app-card command-shell p-7 md:p-8">
      <span class="brand-chip">Control Room</span>
      <div class="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
        <div>
          <h1 class="app-title max-w-3xl text-4xl md:text-5xl">
            账号自动化控制台
          </h1>
          <p class="app-copy mt-4 max-w-2xl text-sm leading-7">
            统一管理注册链路、邮箱接码、失败重试和浏览器环境。把每一次创建流程变成可观察、可回溯、可调参的任务。
          </p>
        </div>
        <div class="grid grid-cols-3 gap-2 text-xs">
          <div class="metric-tile">
            <p class="app-muted">类型</p>
            <p class="mt-1 text-2xl font-black" style="color: var(--app-text);">{{ center.providers.length }}</p>
          </div>
          <div class="metric-tile">
            <p class="app-muted">成功</p>
            <p class="mt-1 text-2xl font-black status-success">
              {{ center.providers.reduce((sum, item) => sum + center.providerStats(item.id).successCount, 0) }}
            </p>
          </div>
          <div class="metric-tile">
            <p class="app-muted">容量</p>
            <p class="mt-1 text-2xl font-black" style="color: var(--app-accent);">
              {{ center.providers.reduce((sum, item) => sum + center.providerStats(item.id).maxManage, 0) }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <button
        v-for="provider in center.providers"
        :key="provider.id"
        class="app-card provider-card group p-5"
        @click="openProvider(provider.id)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex h-11 w-11 items-center justify-center rounded-2xl border text-base font-black" style="border-color: var(--app-border); background: var(--app-surface-subtle); color: var(--app-primary);">
            {{ provider.name.slice(0, 1) }}
          </div>
          <span class="app-muted rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]" style="border-color: var(--app-border); background: var(--app-surface-subtle);">
            Open
          </span>
        </div>
        <p class="mt-5 text-lg font-black" style="color: var(--app-text);">{{ provider.name }}</p>
        <p class="app-copy mt-2 min-h-12 text-sm leading-relaxed">{{ provider.intro }}</p>

        <div class="app-muted mt-5 grid grid-cols-3 gap-2 text-xs">
          <div class="metric-tile">
            <p>已注册</p>
            <p class="mt-1 text-base font-semibold" style="color: var(--app-text);">{{ center.providerStats(provider.id).successCount }}</p>
          </div>
          <div class="metric-tile">
            <p>总账号</p>
            <p class="mt-1 text-base font-semibold" style="color: var(--app-text);">{{ center.providerStats(provider.id).total }}</p>
          </div>
          <div class="metric-tile">
            <p>可管理</p>
            <p class="mt-1 text-base font-semibold" style="color: var(--app-text);">{{ center.providerStats(provider.id).maxManage }}</p>
          </div>
        </div>
      </button>
    </div>

    <div v-if="center.providers.length === 0" class="app-card app-copy p-6 text-sm">
      账号卡片未能从本地配置恢复，页面已回退到默认结构。刷新一次页面后如果仍为空，我会继续帮你查。
    </div>
  </section>
</template>
