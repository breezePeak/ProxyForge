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
  <section class="grid gap-8">
    <!-- Hero -->
    <div class="neon-card p-8 text-center">
      <h1 class="neon-text-mixed text-3xl font-black tracking-tight">Account Center</h1>
      <p class="mt-3 text-sm text-slate-400 max-w-lg mx-auto">按类型管理账号，点击卡片进入详情页查看列表并创建账号。</p>
    </div>

    <!-- Provider Cards Grid -->
    <div class="grid gap-5 md:grid-cols-3">
      <button
        v-for="provider in center.providers"
        :key="provider.id"
        class="neon-card rise-on-hover p-6 text-left group"
        @click="openProvider(provider.id)"
      >
        <div class="flex items-center gap-3">
          <span class="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(0,229,255,0.6)]" />
          <p class="text-base font-bold text-cyan-300 group-hover:text-cyan-200 transition">{{ provider.name }}</p>
        </div>
        <p class="mt-3 text-sm leading-relaxed text-slate-400">{{ provider.intro }}</p>
        <div class="mt-6 grid grid-cols-3 gap-3">
          <div class="rounded-lg bg-[#05070a]/60 border border-slate-800/60 px-3 py-3 text-center">
            <p class="text-[10px] text-slate-500 uppercase tracking-wider">已注册</p>
            <p class="mt-1 text-lg font-bold text-cyan-300">{{ center.providerStats(provider.id).successCount }}</p>
          </div>
          <div class="rounded-lg bg-[#05070a]/60 border border-slate-800/60 px-3 py-3 text-center">
            <p class="text-[10px] text-slate-500 uppercase tracking-wider">总账号</p>
            <p class="mt-1 text-lg font-bold text-slate-200">{{ center.providerStats(provider.id).total }}</p>
          </div>
          <div class="rounded-lg bg-[#05070a]/60 border border-slate-800/60 px-3 py-3 text-center">
            <p class="text-[10px] text-slate-500 uppercase tracking-wider">可管理</p>
            <p class="mt-1 text-lg font-bold text-purple-300">{{ center.providerStats(provider.id).maxManage }}</p>
          </div>
        </div>
      </button>
    </div>

    <div v-if="center.providers.length === 0" class="neon-card p-8 text-center text-sm text-slate-500">
      账号卡片未能从本地配置恢复，刷新页面重试。
    </div>
  </section>
</template>
