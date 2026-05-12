<script setup>
import { reactive, watch, ref } from 'vue';

const props = defineProps({
  show: {
    type: Boolean,
    required: true
  },
  account: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['update:show', 'save']);

const formData = reactive({
  enabled: false,
  server: '',
  port: 8080,
  protocol: 'http',
  username: '',
  password: ''
});

const formErrors = ref({
  server: '',
  port: '',
  general: ''
});

// Load existing config when account changes
watch(() => props.account, (newAccount) => {
  if (newAccount?.proxyConfig) {
    Object.assign(formData, newAccount.proxyConfig);
  } else {
    // Reset to defaults
    formData.enabled = false;
    formData.server = '';
    formData.port = 8080;
    formData.protocol = 'http';
    formData.username = '';
    formData.password = '';
  }
  // Clear errors when account changes
  clearErrors();
}, { immediate: true });

function clearErrors() {
  formErrors.value = {
    server: '',
    port: '',
    general: ''
  };
}

function isValidUrl(str) {
  // Check if it's a valid hostname or IP address
  // Allow formats like: example.com, proxy.example.com, 192.168.1.1, localhost
  const hostnamePattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  
  // Remove protocol if present
  const cleanStr = str.replace(/^(https?|socks5):\/\//, '');
  
  return hostnamePattern.test(cleanStr) || ipPattern.test(cleanStr) || cleanStr === 'localhost';
}

function validateForm() {
  clearErrors();
  let isValid = true;
  
  // Validate server address
  if (!formData.server || formData.server.trim() === '') {
    formErrors.value.server = '服务器地址不能为空';
    isValid = false;
  } else if (!isValidUrl(formData.server.trim())) {
    formErrors.value.server = '服务器地址格式不正确，请输入有效的域名或IP地址';
    isValid = false;
  }
  
  // Validate port range
  if (!Number.isInteger(formData.port) || formData.port < 1 || formData.port > 65535) {
    formErrors.value.port = '端口号必须在 1-65535 之间';
    isValid = false;
  }
  
  // Protocol validation is handled by select element, so no need to validate
  
  return isValid;
}

function close() {
  clearErrors();
  emit('update:show', false);
}

function save() {
  if (!validateForm()) {
    formErrors.value.general = '请修正表单中的错误后再保存';
    return;
  }
  
  emit('save', { ...formData });
  close();
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        @click.self="close"
      >
        <div class="neon-card w-full max-w-md p-6 m-4">
          <h2 class="neon-text-cyan text-xl font-bold">反代配置</h2>
          <p class="mt-1 text-sm text-slate-400">
            为账号 {{ account?.username || account?.email }} 配置代理服务器
          </p>
          
          <form @submit.prevent="save" class="mt-4 space-y-4">
            <!-- General error message -->
            <div
              v-if="formErrors.general"
              class="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400"
            >
              {{ formErrors.general }}
            </div>
            
            <label class="flex items-center gap-2 text-sm">
<input
                 type="checkbox"
                 v-model="formData.enabled"
                 class="rounded accent-cyan-500"
               />
              <span class="text-slate-300">启用反代</span>
            </label>
            
            <label class="grid gap-1 text-sm">
              <span class="text-slate-300">服务器地址 *</span>
<input
                 v-model="formData.server"
                 type="text"
                 placeholder="proxy.example.com"
                 :class="formErrors.server ? 'neon-input-error' : 'neon-input'"
               />
              <span v-if="formErrors.server" class="text-xs text-red-400">
                {{ formErrors.server }}
              </span>
            </label>
            
            <label class="grid gap-1 text-sm">
              <span class="text-slate-300">端口 *</span>
<input
                 v-model.number="formData.port"
                 type="number"
                 min="1"
                 max="65535"
                 :class="formErrors.port ? 'neon-input-error' : 'neon-input'"
               />
              <span v-if="formErrors.port" class="text-xs text-red-400">
                {{ formErrors.port }}
              </span>
            </label>
            
            <label class="grid gap-1 text-sm">
              <span class="text-slate-300">协议</span>
<select
                 v-model="formData.protocol"
                 class="neon-input"
               >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </label>
            
            <label class="grid gap-1 text-sm">
              <span class="text-slate-300">用户名（可选）</span>
<input
                 v-model="formData.username"
                 type="text"
                 placeholder="代理认证用户名"
                 class="neon-input"
               />
            </label>
            
            <label class="grid gap-1 text-sm">
              <span class="text-slate-300">密码（可选）</span>
<input
                 v-model="formData.password"
                 type="password"
                 placeholder="代理认证密码"
                 class="neon-input"
               />
            </label>
            
            <div class="flex gap-3 pt-2">
              <button
                type="button"
                @click="close"
                class="neon-btn flex-1"
              >
                取消
              </button>
              <button
                type="submit"
                class="neon-btn-primary flex-1"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .glass-card,
.modal-leave-active .glass-card {
  transition: transform 0.3s ease;
}

.modal-enter-from .glass-card,
.modal-leave-to .glass-card {
  transform: scale(0.9);
}
</style>
