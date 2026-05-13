<script setup>
import ProxyServerPanel from '../components/ProxyServerPanel.vue';
</script>

<template>
  <section class="grid gap-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-xl font-bold text-slate-100">API 反代配置</h1>
        <p class="mt-0.5 text-sm text-slate-400">配置并管理本地反向代理服务</p>
      </div>
    </div>

    <!-- Proxy Configuration Card -->
    <div class="rounded-xl bg-[#1a1d23] border border-slate-800/60 p-6">
      <h2 class="text-base font-bold text-slate-100 mb-4">服务配置</h2>
      <ProxyServerPanel />
    </div>

    <!-- Help Card -->
    <div class="rounded-xl bg-[#1a1d23] border border-slate-800/60 p-6">
      <h2 class="text-base font-bold text-slate-100 mb-4">使用说明</h2>
      <div class="space-y-3 text-sm text-slate-400">
        <div class="rounded-lg bg-slate-800/40 p-4">
          <h3 class="text-slate-200 font-medium mb-2">OpenAI 兼容接口</h3>
          <code class="text-xs text-cyan-400 font-mono">http://127.0.0.1:11434/v1/chat/completions</code>
          <p class="mt-2 text-xs">支持所有 OpenAI SDK 和工具，只需修改 base URL</p>
        </div>
        <div class="rounded-lg bg-slate-800/40 p-4">
          <h3 class="text-slate-200 font-medium mb-2">Anthropic 兼容接口</h3>
          <code class="text-xs text-cyan-400 font-mono">http://127.0.0.1:11434/v1/messages</code>
          <p class="mt-2 text-xs">支持 Anthropic SDK 和 Claude API 调用</p>
        </div>
        <div class="rounded-lg bg-slate-800/40 p-4">
          <h3 class="text-slate-200 font-medium mb-2">账号轮询策略</h3>
          <p class="text-xs">请求会自动分配至可用账号，支持 X-Account-Id 头指定特定账号</p>
        </div>
      </div>
    </div>
  </section>
</template>
