# Design Document

## Introduction

本设计文档定义了账号额度刷新功能（Refresh Quota Feature）的技术架构和实现方案。该功能为用户提供轻量级的单账号额度更新能力，通过在账号卡片上添加刷新按钮，允许用户快速获取最新的额度信息，而无需执行完整的账号同步操作。

## Architecture Overview

### System Context

账号额度刷新功能集成在现有的账号中心系统中，主要涉及以下组件：

1. **ProviderDetailView.vue** - 提供商详情视图，展示账号列表和账号卡片
2. **accountCenter.js** - Pinia 状态管理存储，负责账号数据管理和业务逻辑
3. **Account Card UI** - 账号卡片 UI 组件（内嵌在 ProviderDetailView 中）

### Component Interaction

```
┌─────────────────────────────────────────────────────────────┐
│                    ProviderDetailView.vue                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Account Card (v-for loop)                 │ │
│  │  ┌──────────────────────────────────────────────────┐ │ │
│  │  │  Account Info                    [Refresh Button] │ │ │
│  │  │  - Email/Username                                 │ │ │
│  │  │  - Quota Display                                  │ │ │
│  │  │  - Models                                         │ │ │
│  │  └──────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           │ @click="refreshQuota"            │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Local State Management                    │ │
│  │  - loadingStates: Map<accountId, boolean>             │ │
│  │  - errorMessages: Map<accountId, string>              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ center.refreshQuota(providerId, accountId)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              accountCenter.js (Pinia Store)                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  refreshQuota(providerId, accountId)                   │ │
│  │    1. Clear cache: delete quotaCache[key]             │ │
│  │    2. Call API: window.desktop.quota.getQuota()       │ │
│  │    3. Update account: updateAccount(...)              │ │
│  │    4. Update cache: setCachedQuota(...)               │ │
│  │    5. Persist: persistDebounced()                     │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ window.desktop.quota.getQuota()
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Electron IPC Layer                        │
│  - Communicates with backend API                            │
│  - Returns { quotaUsed, quotaTotal }                        │
└─────────────────────────────────────────────────────────────┘
```

## Component Design

### 1. UI Components

#### 1.1 Refresh Button

**Location**: 账号卡片右上角，与现有的"切换账号"和"配置反代"按钮并列

**Visual Design**:
```vue
<button
  @click.stop="handleRefreshQuota(item)"
  :disabled="isRefreshing(item.id)"
  class="rounded-md p-1.5 transition"
  :class="isRefreshing(item.id) 
    ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
    : 'bg-slate-800 text-cyan-400 hover:bg-cyan-900 hover:text-cyan-300'"
  :title="刷新额度"
  :aria-label="刷新额度"
  :aria-busy="isRefreshing(item.id) ? 'true' : 'false'"
>
  <!-- Refresh Icon (SVG) -->
  <svg 
    class="w-4 h-4" 
    :class="{ 'animate-spin': isRefreshing(item.id) }"
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
```

**States**:
- **Default**: 灰色背景，青色图标，hover 时背景变深
- **Loading**: 图标旋转动画，按钮禁用，灰色样式
- **Error**: 按钮恢复可用状态，允许重试

#### 1.2 Error Message Display

**Location**: 账号卡片下方或页面顶部通知区域

**Visual Design**:
```vue
<div 
  v-if="getErrorMessage(item.id)"
  role="alert"
  class="mt-2 rounded-md border border-rose-500/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-300"
>
  <div class="flex items-center justify-between">
    <span>{{ getErrorMessage(item.id) }}</span>
    <button 
      @click="clearError(item.id)"
      class="ml-2 text-rose-400 hover:text-rose-300"
      aria-label="关闭错误提示"
    >
      ✕
    </button>
  </div>
</div>
```

**Auto-dismiss**: 使用 `setTimeout` 在 5 秒后自动清除错误消息

### 2. State Management

#### 2.1 Local Component State (ProviderDetailView.vue)

```javascript
// 刷新状态管理
const refreshState = reactive({
  // 记录每个账号的加载状态
  loadingStates: new Map(), // Map<accountId, boolean>
  // 记录每个账号的错误消息
  errorMessages: new Map(), // Map<accountId, string>
  // 自动清除错误消息的定时器
  errorTimers: new Map() // Map<accountId, timeoutId>
});

// 检查账号是否正在刷新
function isRefreshing(accountId) {
  return refreshState.loadingStates.get(accountId) || false;
}

// 获取账号的错误消息
function getErrorMessage(accountId) {
  return refreshState.errorMessages.get(accountId) || '';
}

// 清除错误消息
function clearError(accountId) {
  refreshState.errorMessages.delete(accountId);
  const timer = refreshState.errorTimers.get(accountId);
  if (timer) {
    clearTimeout(timer);
    refreshState.errorTimers.delete(accountId);
  }
}

// 设置错误消息（带自动清除）
function setError(accountId, message) {
  refreshState.errorMessages.set(accountId, message);
  
  // 清除旧的定时器
  const oldTimer = refreshState.errorTimers.get(accountId);
  if (oldTimer) {
    clearTimeout(oldTimer);
  }
  
  // 设置新的自动清除定时器
  const timer = setTimeout(() => {
    clearError(accountId);
  }, 5000);
  
  refreshState.errorTimers.set(accountId, timer);
}
```

#### 2.2 Store Actions (accountCenter.js)

```javascript
// 新增 action: refreshQuota
async refreshQuota(providerId, accountId) {
  // 1. 构建缓存键
  const cacheKey = `${providerId}_${accountId}`;
  
  // 2. 清除缓存（在请求前）
  if (this.quotaCache[cacheKey]) {
    delete this.quotaCache[cacheKey];
  }
  
  // 3. 调用 Electron IPC 获取额度信息
  if (!window.desktop?.quota?.getQuota) {
    throw new Error('额度查询接口未就绪，请使用 Electron 模式运行');
  }
  
  const result = await window.desktop.quota.getQuota({
    providerId,
    accountId
  });
  
  // 4. 验证返回数据
  if (!result || typeof result.quotaUsed !== 'number' || typeof result.quotaTotal !== 'number') {
    throw new Error('额度数据格式无效');
  }
  
  // 5. 更新账号数据（仅更新 quotaUsed 和 quotaTotal）
  const updated = this.updateAccount(providerId, accountId, {
    quotaUsed: result.quotaUsed,
    quotaTotal: result.quotaTotal
  });
  
  if (!updated) {
    throw new Error('账号不存在或更新失败');
  }
  
  // 6. 更新缓存
  this.setCachedQuota(providerId, accountId, {
    quotaUsed: result.quotaUsed,
    quotaTotal: result.quotaTotal
  });
  
  // 7. 持久化到 localStorage（使用防抖）
  this.persistDebounced();
  
  return updated;
}
```

### 3. Event Handlers

#### 3.1 Refresh Button Click Handler

```javascript
async function handleRefreshQuota(account) {
  const accountId = account.id;
  
  // 防止重复请求
  if (isRefreshing(accountId)) {
    return;
  }
  
  // 清除之前的错误消息
  clearError(accountId);
  
  // 设置加载状态
  refreshState.loadingStates.set(accountId, true);
  
  try {
    // 调用 store action
    await center.refreshQuota(providerId.value, accountId);
    
    // 成功：记录日志
    pushLog(`✅ 已刷新账号额度: ${account.username || account.email}`);
  } catch (error) {
    // 失败：显示错误消息
    const errorMessage = error instanceof Error ? error.message : String(error);
    setError(accountId, `刷新失败: ${errorMessage}`);
    pushLog(`❌ 刷新额度失败: ${errorMessage}`);
  } finally {
    // 清除加载状态
    refreshState.loadingStates.set(accountId, false);
  }
}
```

## Data Models

### Account Object (Partial)

```typescript
interface Account {
  id: string;
  email: string;
  username: string;
  status: 'success' | 'failed' | 'pending';
  
  // 额度相关字段（本功能关注的核心字段）
  quotaUsed: number;      // 已使用额度
  quotaTotal: number;     // 总额度
  
  // 其他字段（不受 refreshQuota 影响）
  password: string;
  localFilePath: string;
  note: string;
  ssoTokenPreview: string;
  kiroProfilePath: string;
  kiroClientBoundAt: string;
  kiroClientLastLaunchAt: string;
  kiroExecutablePath: string;
  authMode: string;
  webProfilePath: string;
  storageStatePath: string;
  ssoCookieName: string;
  availableModels: string[];
  discoveredApis: Array<{ method: string; url: string; status: number }>;
  lastLoginUrl: string;
  addedAt: string;
  createdAt: string;
  proxyConfig?: ProxyConfig;
}
```

### Quota Cache Entry

```typescript
interface QuotaCacheEntry {
  data: {
    quotaUsed: number;
    quotaTotal: number;
  };
  timestamp: number; // Date.now()
}

// Store state
interface AccountCenterState {
  quotaCache: Record<string, QuotaCacheEntry>; // key: `${providerId}_${accountId}`
}
```

### API Response

```typescript
interface QuotaResponse {
  quotaUsed: number;
  quotaTotal: number;
}
```

## Error Handling

### Error Types

1. **API Not Available**: Electron IPC 接口未就绪
   - Message: "额度查询接口未就绪，请使用 Electron 模式运行"
   - Recovery: 提示用户使用 Electron 模式

2. **Network Error**: 网络请求失败
   - Message: "网络请求失败，请检查网络连接"
   - Recovery: 允许用户重试

3. **Invalid Response**: API 返回数据格式无效
   - Message: "额度数据格式无效"
   - Recovery: 允许用户重试

4. **Account Not Found**: 账号不存在
   - Message: "账号不存在或更新失败"
   - Recovery: 刷新页面或联系支持

5. **Timeout**: 请求超时（5秒）
   - Message: "请求超时，请稍后重试"
   - Recovery: 允许用户重试

### Error Display Strategy

- **Location**: 错误消息显示在账号卡片下方，使用红色边框和背景
- **Auto-dismiss**: 5 秒后自动消失
- **Manual dismiss**: 用户可点击关闭按钮手动关闭
- **Retry**: 错误状态下，刷新按钮保持可用，允许用户重试

## Performance Considerations

### 1. Cache Management

- **Cache Duration**: 5 分钟
- **Cache Invalidation**: 
  - 用户点击刷新按钮时立即清除对应账号的缓存
  - 定期清理过期缓存（每分钟执行一次）
- **Cache Key**: `${providerId}_${accountId}`

### 2. Debounced Persistence

- 使用现有的 `persistDebounced()` 方法
- 防抖延迟: 300ms
- 减少频繁的 localStorage 写入操作

### 3. Optimistic UI Updates

- 不使用乐观更新策略
- 等待 API 响应后再更新 UI
- 通过加载状态提供即时反馈

### 4. Request Deduplication

- 通过 `loadingStates` Map 防止同一账号的重复请求
- 加载状态为 true 时，忽略后续点击事件

## Accessibility

### ARIA Attributes

```vue
<button
  aria-label="刷新额度"
  :aria-busy="isRefreshing(item.id) ? 'true' : 'false'"
  :disabled="isRefreshing(item.id)"
>
  <!-- Icon -->
</button>

<div 
  v-if="getErrorMessage(item.id)"
  role="alert"
>
  {{ getErrorMessage(item.id) }}
</div>
```

### Keyboard Navigation

- **Tab**: 刷新按钮可通过 Tab 键聚焦
- **Enter/Space**: 聚焦状态下按 Enter 或 Space 键触发刷新
- **Focus Indicator**: 使用 Tailwind 的 `focus:` 伪类提供可见的焦点指示器

### Screen Reader Support

- `aria-label`: 提供按钮的描述性标签
- `aria-busy`: 指示按钮的加载状态
- `role="alert"`: 错误消息会被屏幕阅读器自动播报

## Integration Points

### 1. Electron IPC

**New IPC Channel**: `quota:getQuota`

```javascript
// Preload script (electron/preload.cjs)
contextBridge.exposeInMainWorld('desktop', {
  // ... existing APIs
  quota: {
    getQuota: (params) => ipcRenderer.invoke('quota:getQuota', params)
  }
});

// Main process (electron/main.cjs)
ipcMain.handle('quota:getQuota', async (event, params) => {
  const { providerId, accountId } = params;
  
  // 调用后端 API 获取额度信息
  // 这里需要根据实际的后端 API 实现
  const response = await fetch(`https://api.example.com/quota/${providerId}/${accountId}`);
  const data = await response.json();
  
  return {
    quotaUsed: data.used,
    quotaTotal: data.total
  };
});
```

### 2. Existing Store Methods

- **updateAccount()**: 用于更新账号的 quotaUsed 和 quotaTotal 字段
- **persistDebounced()**: 用于防抖持久化数据到 localStorage
- **setCachedQuota()**: 用于更新额度缓存
- **getCachedQuota()**: 用于读取缓存的额度信息

## Testing Strategy

### Unit Tests

1. **Refresh Button Rendering**
   - 验证按钮在账号卡片上正确渲染
   - 验证按钮包含正确的图标和 ARIA 属性

2. **Loading State**
   - 验证点击按钮后立即进入加载状态
   - 验证加载状态下按钮被禁用
   - 验证加载状态下图标显示旋转动画

3. **Error Handling**
   - 验证 API 错误时显示错误消息
   - 验证错误消息 5 秒后自动消失
   - 验证用户可手动关闭错误消息

4. **Store Action**
   - 验证 refreshQuota 方法正确调用 IPC
   - 验证 refreshQuota 方法仅更新 quotaUsed 和 quotaTotal
   - 验证 refreshQuota 方法正确处理缓存

5. **Accessibility**
   - 验证按钮具有正确的 aria-label
   - 验证加载状态下 aria-busy 为 "true"
   - 验证错误消息具有 role="alert"

### Property-Based Tests

Property-based tests will be defined in the Correctness Properties section below.

### Integration Tests

1. **End-to-End Refresh Flow**
   - 模拟用户点击刷新按钮
   - 验证 IPC 调用
   - 验证 UI 更新
   - 验证数据持久化

2. **Cache Behavior**
   - 验证刷新操作清除缓存
   - 验证成功响应更新缓存
   - 验证失败响应不更新缓存

3. **Performance**
   - 验证请求在 5 秒内完成
   - 验证持久化在 500ms 内完成
   - 验证不触发其他账号卡片的重新渲染

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

在生成最终的正确性属性之前，我需要识别并消除冗余：

**Identified Redundancies:**

1. **Requirements 2.3 和 2.4**: 两者都在测试 refreshQuota 只更新 quotaUsed 和 quotaTotal，不修改其他字段。这是同一个不变性的正反两面表述。
   - **Resolution**: 合并为一个属性，测试字段更新的不变性

2. **Requirements 2.3, 7.4**: 重复测试相同的不变性（只更新额度字段）
   - **Resolution**: 合并为 Property 1

3. **Requirements 5.1 和 5.3**: 都在测试更新后的额度值被持久化到 localStorage
   - **Resolution**: 合并为一个属性

4. **Requirements 6.2 和 6.4**: 都在测试缓存清除发生在网络请求之前
   - **Resolution**: 保留 6.2 作为示例测试，不作为属性

**Final Property Set** (after removing redundancies):
- Property 1: 字段更新不变性 (combines 2.3, 2.4, 7.4)
- Property 2: 加载状态下按钮禁用 (3.3)
- Property 3: 操作完成后清除加载状态 (3.4)
- Property 4: 失败时显示错误消息 (4.1)
- Property 5: 错误状态下按钮可用 (4.4)
- Property 6: 重试时清除错误消息 (4.5)
- Property 7: 持久化更新的额度值 (combines 5.1, 5.3)
- Property 8: 持久化和加载的往返一致性 (5.4)
- Property 9: 刷新时清除缓存 (6.1)
- Property 10: 成功时更新缓存 (6.3)
- Property 11: 失败时不更新缓存 (6.5)
- Property 12: 加载状态下 aria-busy 为 true (8.5)

### Property 1: 字段更新不变性

*For any* account with arbitrary field values, when refreshQuota successfully updates quotaUsed and quotaTotal, all other account fields SHALL remain unchanged.

**Validates: Requirements 2.3, 2.4, 7.4**

### Property 2: 加载状态下按钮禁用

*For any* account, when the refresh operation is in loading state, the refresh button SHALL be disabled.

**Validates: Requirements 3.3**

### Property 3: 操作完成后清除加载状态

*For any* refresh operation result (success or failure), when the operation completes, the loading state SHALL be set to false.

**Validates: Requirements 3.4**

### Property 4: 失败时显示错误消息

*For any* refresh operation that fails with an error, an error message SHALL be displayed to the user.

**Validates: Requirements 4.1**

### Property 5: 错误状态下按钮可用

*For any* error state, the refresh button SHALL remain enabled to allow retry.

**Validates: Requirements 4.4**

### Property 6: 重试时清除错误消息

*For any* error state, when the user clicks the refresh button to retry, the previous error message SHALL be cleared before the new operation starts.

**Validates: Requirements 4.5**

### Property 7: 持久化更新的额度值

*For any* successful quota update with new quotaUsed and quotaTotal values, the updated values SHALL be persisted to localStorage.

**Validates: Requirements 5.1, 5.3**

### Property 8: 持久化和加载的往返一致性

*For any* quota values that are persisted to localStorage, when the store is reloaded, the loaded quota values SHALL match the persisted values.

**Validates: Requirements 5.4**

### Property 9: 刷新时清除缓存

*For any* account with cached quota data, when the user clicks the refresh button, the quota cache entry for that account SHALL be removed before the API request is initiated.

**Validates: Requirements 6.1**

### Property 10: 成功时更新缓存

*For any* successful refresh operation with new quota data, the quotaCache SHALL be updated with the new quota values.

**Validates: Requirements 6.3**

### Property 11: 失败时不更新缓存

*For any* failed refresh operation, the quotaCache SHALL NOT be updated with new values.

**Validates: Requirements 6.5**

### Property 12: 加载状态下 aria-busy 为 true

*For any* refresh button in loading state, the aria-busy attribute SHALL be set to "true".

**Validates: Requirements 8.5**

## Implementation Notes

### Code Style

- 遵循现有代码库的 Vue 3 Composition API 风格
- 使用 Tailwind CSS 进行样式设计
- 使用 reactive() 和 Map 管理组件本地状态
- 使用 async/await 处理异步操作

### File Modifications

1. **src/views/ProviderDetailView.vue**
   - 添加 refreshState reactive 对象
   - 添加 isRefreshing, getErrorMessage, clearError, setError 辅助函数
   - 添加 handleRefreshQuota 事件处理函数
   - 在账号卡片模板中添加刷新按钮
   - 在账号卡片模板中添加错误消息显示

2. **src/stores/accountCenter.js**
   - 添加 refreshQuota action

3. **electron/preload.cjs**
   - 添加 quota.getQuota IPC 通道

4. **electron/main.cjs**
   - 添加 quota:getQuota IPC 处理器

### Dependencies

无需添加新的依赖，使用现有的技术栈：
- Vue 3
- Pinia
- Tailwind CSS
- Electron IPC

## Security Considerations

1. **Input Validation**: 验证 providerId 和 accountId 参数，防止注入攻击
2. **Error Messages**: 不在错误消息中暴露敏感信息（如 API 密钥、内部路径）
3. **Rate Limiting**: 通过 loadingStates 防止用户快速连续点击造成的请求风暴
4. **Data Sanitization**: 验证 API 返回的数据格式，防止恶意数据污染状态

## Future Enhancements

1. **Batch Refresh**: 支持批量刷新多个账号的额度
2. **Auto Refresh**: 支持定时自动刷新额度（可配置间隔）
3. **Refresh History**: 记录刷新历史和时间戳
4. **Quota Alerts**: 当额度低于阈值时显示警告
5. **Detailed Breakdown**: 支持刷新详细的额度分段信息（subscription, freeTier, bonus）

## Conclusion

本设计文档定义了账号额度刷新功能的完整技术方案，包括 UI 组件、状态管理、错误处理、性能优化和可访问性支持。该功能采用轻量级实现方式，仅更新必要的额度字段，通过缓存管理和防抖持久化优化性能，并提供完善的用户反馈和错误处理机制。
