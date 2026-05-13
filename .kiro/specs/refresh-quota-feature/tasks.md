# Implementation Plan: Refresh Quota Feature

## Overview

本实现计划将账号额度刷新功能分解为一系列增量式的编码任务。实现顺序遵循"后端优先"原则：首先建立 Electron IPC 通信层，然后实现 Store 业务逻辑，最后完成 UI 组件集成。每个任务都明确引用相关需求条款，确保需求覆盖的完整性和可追溯性。

## Tasks

- [x] 1. 实现 Electron IPC 层 - 额度查询接口
  - [x] 1.1 在 electron/preload.cjs 中暴露 quota.getQuota IPC 方法
    - 在 `contextBridge.exposeInMainWorld('desktop', {...})` 中添加 `quota` 对象
    - 实现 `getQuota: (params) => ipcRenderer.invoke('quota:getQuota', params)` 方法
    - 确保方法接受 `{ providerId, accountId }` 参数对象
    - _Requirements: 2.1, 2.2, 7.1_

  - [ ]* 1.2 编写 preload.cjs 的单元测试
    - 验证 quota.getQuota 方法正确暴露到 window.desktop
    - 验证方法调用正确传递参数到 ipcRenderer.invoke
    - _Requirements: 2.1, 2.2_

  - [x] 1.3 在 electron/main.cjs 中实现 quota:getQuota IPC 处理器
    - 使用 `ipcMain.handle('quota:getQuota', async (event, params) => {...})` 注册处理器
    - 从 params 中提取 providerId 和 accountId
    - 调用后端 API 获取额度信息（当前实现可返回模拟数据）
    - 返回 `{ quotaUsed: number, quotaTotal: number }` 格式的数据
    - 添加错误处理，捕获网络错误和无效响应
    - _Requirements: 2.1, 2.2, 2.6, 4.1_

  - [ ]* 1.4 编写 main.cjs IPC 处理器的单元测试
    - 验证处理器正确解析参数
    - 验证返回数据格式符合 `{ quotaUsed, quotaTotal }` 规范
    - 验证错误处理逻辑（网络错误、无效响应）
    - _Requirements: 2.2, 4.1_

- [x] 2. Checkpoint - 验证 IPC 层实现
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. 实现 Store Action - refreshQuota 方法
  - [x] 3.1 在 src/stores/accountCenter.js 中添加 refreshQuota action
    - 实现方法签名：`async refreshQuota(providerId, accountId)`
    - 构建缓存键：`const cacheKey = \`\${providerId}_\${accountId}\``
    - 在请求前清除缓存：`delete this.quotaCache[cacheKey]`
    - 验证 IPC 接口可用性：检查 `window.desktop?.quota?.getQuota`
    - 调用 IPC：`const result = await window.desktop.quota.getQuota({ providerId, accountId })`
    - 验证返回数据格式：检查 `result.quotaUsed` 和 `result.quotaTotal` 是否为数字
    - 使用 `updateAccount()` 更新账号的 quotaUsed 和 quotaTotal 字段
    - 使用 `setCachedQuota()` 更新缓存
    - 调用 `persistDebounced()` 持久化数据
    - 返回更新后的账号对象
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 6.1, 6.3, 7.1, 7.2, 7.3, 7.4_

  - [x] 3.2 在 refreshQuota 中添加错误处理
    - 当 IPC 接口不可用时抛出错误："额度查询接口未就绪，请使用 Electron 模式运行"
    - 当返回数据格式无效时抛出错误："额度数据格式无效"
    - 当账号不存在或更新失败时抛出错误："账号不存在或更新失败"
    - 确保失败时不更新缓存
    - _Requirements: 4.1, 6.5_

  - [ ]* 3.3 编写 refreshQuota 方法的单元测试
    - **Property 1: 字段更新不变性**
    - **Validates: Requirements 2.3, 2.4, 7.4**
    - 验证 refreshQuota 只更新 quotaUsed 和 quotaTotal，不修改其他字段
    - 验证成功时调用 persistDebounced()
    - 验证成功时更新缓存
    - 验证失败时不更新缓存
    - 验证 IPC 接口不可用时抛出正确错误
    - 验证数据格式无效时抛出正确错误

  - [ ]* 3.4 编写 refreshQuota 的集成测试
    - 模拟完整的刷新流程：清除缓存 → 调用 IPC → 更新账号 → 更新缓存 → 持久化
    - 验证缓存在请求前被清除
    - 验证持久化在 500ms 内完成
    - _Requirements: 5.5, 6.2, 6.4_

- [x] 4. Checkpoint - 验证 Store 层实现
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 实现 UI 组件 - 刷新按钮和状态管理
  - [x] 5.1 在 ProviderDetailView.vue 中添加刷新状态管理
    - 在 `<script setup>` 中创建 `refreshState` reactive 对象
    - 添加 `loadingStates: new Map()` 用于跟踪每个账号的加载状态
    - 添加 `errorMessages: new Map()` 用于存储每个账号的错误消息
    - 添加 `errorTimers: new Map()` 用于管理错误消息的自动清除定时器
    - 实现 `isRefreshing(accountId)` 辅助函数
    - 实现 `getErrorMessage(accountId)` 辅助函数
    - 实现 `clearError(accountId)` 辅助函数（清除错误和定时器）
    - 实现 `setError(accountId, message)` 辅助函数（设置错误和 5 秒自动清除定时器）
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 4.3, 4.6_

  - [x] 5.2 实现 handleRefreshQuota 事件处理函数
    - 检查是否正在刷新，如果是则直接返回（防止重复请求）
    - 清除之前的错误消息
    - 设置加载状态为 true
    - 在 try 块中调用 `center.refreshQuota(providerId.value, accountId)`
    - 成功时记录日志：`pushLog(\`✅ 已刷新账号额度: \${account.username || account.email}\`)`
    - 失败时调用 `setError(accountId, \`刷新失败: \${errorMessage}\`)` 并记录日志
    - 在 finally 块中设置加载状态为 false
    - _Requirements: 2.1, 2.5, 3.1, 3.4, 3.5, 4.1, 4.4, 4.5_

  - [ ]* 5.3 编写 UI 状态管理的单元测试
    - **Property 2: 加载状态下按钮禁用**
    - **Validates: Requirements 3.3**
    - **Property 3: 操作完成后清除加载状态**
    - **Validates: Requirements 3.4**
    - **Property 4: 失败时显示错误消息**
    - **Validates: Requirements 4.1**
    - **Property 5: 错误状态下按钮可用**
    - **Validates: Requirements 4.4**
    - **Property 6: 重试时清除错误消息**
    - **Validates: Requirements 4.5**
    - 验证 isRefreshing 在加载状态下返回 true
    - 验证 setError 设置错误消息并启动 5 秒定时器
    - 验证 clearError 清除错误消息和定时器
    - 验证 handleRefreshQuota 在加载状态下阻止重复请求

- [x] 6. 实现 UI 组件 - 刷新按钮模板
  - [x] 6.1 在账号卡片中添加刷新按钮
    - 在 ProviderDetailView.vue 的账号卡片模板中，找到"切换账号"和"配置反代"按钮所在的 `<div class="absolute top-3 right-3 flex gap-2">` 容器
    - 在该容器中添加刷新按钮，位于其他按钮之前
    - 按钮使用 `@click.stop="handleRefreshQuota(item)"` 绑定点击事件
    - 使用 `:disabled="isRefreshing(item.id)"` 绑定禁用状态
    - 添加动态 class：加载时显示灰色禁用样式，正常时显示青色可交互样式
    - 添加 `:title="刷新额度"` 和 `:aria-label="刷新额度"` 属性
    - 添加 `:aria-busy="isRefreshing(item.id) ? 'true' : 'false'"` 属性
    - 使用 SVG 图标（刷新箭头），加载时添加 `animate-spin` class
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.2, 3.3, 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 6.2 在账号卡片中添加错误消息显示
    - 在账号卡片模板的底部（额度信息和模型列表之后）添加错误消息容器
    - 使用 `v-if="getErrorMessage(item.id)"` 条件渲染
    - 添加 `role="alert"` 属性用于屏幕阅读器播报
    - 使用红色边框和背景样式（`border-rose-500/50 bg-rose-950/30 text-rose-300`）
    - 显示错误消息文本：`{{ getErrorMessage(item.id) }}`
    - 添加关闭按钮，绑定 `@click="clearError(item.id)"` 事件
    - 关闭按钮添加 `aria-label="关闭错误提示"` 属性
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 8.6_

  - [ ]* 6.3 编写刷新按钮的组件测试
    - 验证刷新按钮在账号卡片上正确渲染
    - 验证按钮包含正确的 SVG 图标
    - 验证按钮具有正确的 ARIA 属性（aria-label, aria-busy）
    - 验证加载状态下按钮显示旋转动画
    - 验证加载状态下按钮被禁用
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.2, 3.3, 8.1, 8.5_

  - [ ]* 6.4 编写错误消息显示的组件测试
    - 验证错误消息在有错误时显示
    - 验证错误消息具有 role="alert" 属性
    - 验证错误消息 5 秒后自动消失
    - 验证用户可手动关闭错误消息
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 8.6_

- [x] 7. Checkpoint - 验证 UI 组件实现
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. 集成测试和端到端验证
  - [ ]* 8.1 编写端到端刷新流程测试
    - 模拟用户点击刷新按钮
    - 验证 IPC 调用被正确触发
    - 验证 UI 显示加载状态
    - 验证成功后 UI 更新额度值
    - 验证数据持久化到 localStorage
    - _Requirements: 2.1, 2.2, 2.5, 3.1, 3.4, 5.1, 5.3_

  - [ ]* 8.2 编写缓存行为测试
    - **Property 9: 刷新时清除缓存**
    - **Validates: Requirements 6.1**
    - **Property 10: 成功时更新缓存**
    - **Validates: Requirements 6.3**
    - **Property 11: 失败时不更新缓存**
    - **Validates: Requirements 6.5**
    - 验证刷新操作清除缓存
    - 验证成功响应更新缓存
    - 验证失败响应不更新缓存

  - [ ]* 8.3 编写持久化测试
    - **Property 7: 持久化更新的额度值**
    - **Validates: Requirements 5.1, 5.3**
    - **Property 8: 持久化和加载的往返一致性**
    - **Validates: Requirements 5.4**
    - 验证更新后的额度值被持久化到 localStorage
    - 验证重新加载后额度值保持一致

  - [ ]* 8.4 编写性能测试
    - 验证请求在 5 秒内完成
    - 验证持久化在 500ms 内完成
    - 验证不触发其他账号卡片的重新渲染
    - 验证网络带宽消耗小于 100KB
    - _Requirements: 2.6, 5.5, 7.5, 7.6_

  - [ ]* 8.5 编写可访问性测试
    - **Property 12: 加载状态下 aria-busy 为 true**
    - **Validates: Requirements 8.5**
    - 验证刷新按钮可通过 Tab 键聚焦
    - 验证按钮可通过 Enter 或 Space 键激活
    - 验证按钮具有可见的焦点指示器
    - 验证加载状态下 aria-busy 为 "true"
    - 验证错误消息具有 role="alert"
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 9. Final Checkpoint - 完整功能验证
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 任务标记 `*` 的为可选测试任务，可跳过以加快 MVP 交付
- 每个任务都明确引用了相关需求条款，确保需求覆盖的完整性
- Checkpoint 任务用于增量验证，确保每个阶段的实现质量
- 实现顺序遵循"后端优先"原则：IPC 层 → Store 层 → UI 层
- Property-based tests 验证设计文档中定义的正确性属性
- Unit tests 验证具体示例和边界情况

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["3.3", "3.4", "5.1"] },
    { "id": 5, "tasks": ["5.2"] },
    { "id": 6, "tasks": ["5.3", "6.1"] },
    { "id": 7, "tasks": ["6.2"] },
    { "id": 8, "tasks": ["6.3", "6.4"] },
    { "id": 9, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5"] }
  ]
}
```
