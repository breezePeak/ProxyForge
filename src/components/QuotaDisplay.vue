<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  account: {
    type: Object,
    required: true
  }
});

const refreshing = ref(false);

// 计算额度细分信息，支持降级方案
const quotaBreakdown = computed(() => {
  if (!props.account.quotaBreakdown) {
    // 降级方案：只显示总额度
    return {
      subscription: { used: 0, total: 0 },
      freeTier: { used: 0, total: 0 },
      bonus: { used: 0, total: 0 },
      total: {
        used: props.account.quotaUsed || 0,
        total: props.account.quotaTotal || 0
      }
    };
  }
  return props.account.quotaBreakdown;
});

// 计算各类额度的百分比和显示信息
const quotaSegments = computed(() => {
  const total = quotaBreakdown.value.total.total;
  if (!total) return [];
  
  return [
    {
      type: 'subscription',
      label: '套餐',
      used: quotaBreakdown.value.subscription.used,
      total: quotaBreakdown.value.subscription.total,
      percent: (quotaBreakdown.value.subscription.used / total) * 100,
      color: 'from-cyan-400 to-cyan-500'
    },
    {
      type: 'freeTier',
      label: '免费',
      used: quotaBreakdown.value.freeTier.used,
      total: quotaBreakdown.value.freeTier.total,
      percent: (quotaBreakdown.value.freeTier.used / total) * 100,
      color: 'from-emerald-400 to-emerald-500'
    },
    {
      type: 'bonus',
      label: '福利',
      used: quotaBreakdown.value.bonus.used,
      total: quotaBreakdown.value.bonus.total,
      percent: (quotaBreakdown.value.bonus.used / total) * 100,
      color: 'from-purple-400 to-purple-500'
    }
  ].filter(segment => segment.total > 0);
});

// 刷新额度信息
async function refreshQuota() {
  if (refreshing.value) return;
  
  refreshing.value = true;
  try {
    // 这里应该调用 store 的 refreshQuota 方法
    // 但由于当前没有实现该方法，暂时只是模拟刷新
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('额度刷新功能待实现');
  } catch (error) {
    console.error('额度刷新失败:', error);
  } finally {
    refreshing.value = false;
  }
}

// 判断额度是否用尽
function isQuotaExhausted(segment) {
  return segment.used >= segment.total && segment.total > 0;
}

// 格式化额度显示
function formatQuota(used, total) {
  if (!total) return '待同步';
  return `${used}/${total}`;
}
</script>

<template>
  <div class="space-y-3">
    <!-- 额度头部 -->
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-medium text-slate-500 uppercase tracking-wider">额度用量</span>
      <button
        @click="refreshQuota"
        :disabled="refreshing"
        class="neon-btn p-1"
        title="刷新额度信息"
      >
        <svg
          :class="{ 'animate-spin': refreshing }"
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </div>
    
    <!-- 总额度显示 -->
    <div class="text-xl font-bold text-cyan-300 mb-1">
      {{ formatQuota(quotaBreakdown.total.used, quotaBreakdown.total.total) }}
    </div>
    
    <!-- 分段进度条 -->
    <div v-if="quotaBreakdown.total.total > 0" class="neon-progress-track mb-3">
      <div
        v-for="segment in quotaSegments"
        :key="segment.type"
        class="neon-progress-fill"
        :style="{ width: segment.percent + '%' }"
        :title="`${segment.label}: ${segment.used}/${segment.total}`"
      />
    </div>
    
    <!-- 额度详情列表 -->
    <div v-if="quotaSegments.length > 0" class="space-y-1">
      <div
        v-for="segment in quotaSegments"
        :key="segment.type"
        class="flex items-center justify-between text-xs"
      >
        <div class="flex items-center gap-2">
          <div
            class="w-2 h-2 rounded-full"
            :class="`bg-gradient-to-r ${segment.color}`"
          />
          <span :class="segment.type === 'subscription' ? 'text-cyan-400' : segment.type === 'freeTier' ? 'text-emerald-400' : 'text-purple-400'">{{ segment.label }}</span>
        </div>
        <div class="flex items-center gap-1">
          <span class="text-slate-200 font-medium">{{ segment.used }}/{{ segment.total }}</span>
          <span v-if="isQuotaExhausted(segment)" class="text-yellow-400" title="额度已用尽">
            ⚠️
          </span>
        </div>
      </div>
    </div>
    
    <!-- 无细分额度时的简单显示 -->
    <div v-else-if="quotaBreakdown.total.total > 0" class="text-xs text-slate-400">
      总额度
    </div>
    
    <!-- 待同步状态 -->
    <div v-else class="text-xs text-slate-500 italic">
      待同步
    </div>
  </div>
</template>

<style scoped>
.quota-display {
  @apply p-3 rounded-lg bg-slate-900/50 border border-slate-700;
}

.quota-bar {
  position: relative;
}

.quota-bar > div {
  min-width: 2px; /* 确保即使很小的百分比也能显示 */
}
</style>
