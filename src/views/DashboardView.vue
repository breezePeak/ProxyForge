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
    <div class="glass-card p-6">
      <h1 class="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-3xl font-bold text-transparent">账号中心</h1>
      <p class="mt-2 text-sm text-slate-300">按类型管理账号，点击卡片进入详情页查看列表并创建账号。</p>
    </div>

    <div class="grid gap-4 md:grid-cols-3">
      <button
        v-for="provider in center.providers"
        :key="provider.id"
        class="glass-card aura-flow-strong rise-on-hover p-5 text-left"
        @click="openProvider(provider.id)"
      >
        <p class="text-sm font-semibold text-cyan-300">{{ provider.name }}</p>
        <p class="mt-2 text-sm leading-relaxed text-slate-300">{{ provider.intro }}</p>

        <div class="mt-5 grid grid-cols-3 gap-2 text-xs text-slate-400">
          <div class="rounded-lg bg-slate-950/45 px-2 py-2">
            <p>已注册</p>
            <p class="mt-1 text-base font-semibold text-white">{{ center.providerStats(provider.id).successCount }}</p>
          </div>
          <div class="rounded-lg bg-slate-950/45 px-2 py-2">
            <p>总账号</p>
            <p class="mt-1 text-base font-semibold text-white">{{ center.providerStats(provider.id).total }}</p>
          </div>
          <div class="rounded-lg bg-slate-950/45 px-2 py-2">
            <p>可管理</p>
            <p class="mt-1 text-base font-semibold text-white">{{ center.providerStats(provider.id).maxManage }}</p>
          </div>
        </div>
      </button>
    </div>

    <div v-if="center.providers.length === 0" class="glass-card p-6 text-sm text-slate-300">
      账号卡片未能从本地配置恢复，页面已回退到默认结构。刷新一次页面后如果仍为空，我会继续帮你查。
    </div>
  </section>
</template>
