# 实施计划：账号中心界面改进

## 概述

本实施计划将账号中心界面改进功能分为 4 个阶段，每个阶段包含具体的编码任务。任务按照设计文档中的实施阶段划分，确保渐进式开发和及时验证。

## 任务列表

### 阶段 1: 响应式布局 + 切换账号

- [x] 1. 实现响应式卡片布局
  - [x] 1.1 修改 ProviderDetailView.vue 的卡片容器布局
    - 将现有的卡片容器改为 CSS Grid 布局
    - 使用 `grid-template-columns: repeat(auto-fill, 280px)` 实现固定宽度自动填充
    - 设置卡片间距为 12px (`gap: 12px`)
    - 确保卡片宽度固定为 280px
    - _需求: REQ-001 (响应式卡片布局优化)_
  
  - [x] 1.2 添加响应式布局样式
    - 使用 Tailwind CSS 类 `grid gap-3 grid-cols-[repeat(auto-fill,280px)]`
    - 确保容器使用 `justify-content: start` 使最后一行左对齐
    - 测试不同屏幕尺寸下的布局效果（980px, 1280px, 1920px, 2560px）
    - _需求: REQ-001_

- [x] 2. 实现账号切换功能
  - [x] 2.1 添加活跃账号判定逻辑
    - 在 ProviderDetailView.vue 中创建 `isActiveAccount` 函数
    - 实现逻辑：检查 `kiroClientLastLaunchAt` 是否在最近 30 分钟内
    - 处理边界情况：空值、无效日期、未来时间
    - _需求: REQ-002 (账号快速切换功能)_
  
  - [x] 2.2 添加切换账号按钮 UI
    - 在账号卡片右上角添加按钮容器 (`absolute top-3 right-3 flex gap-2`)
    - 添加切换账号图标按钮（使用合适的 SVG 图标）
    - 为活跃账号的按钮添加禁用状态样式（灰色/不可点击）
    - 使用 `@click.stop` 防止触发卡片选中事件
    - _需求: REQ-002_
  
  - [x] 2.3 实现切换账号逻辑
    - 创建 `switchAccount` 函数，接收账号对象作为参数
    - 检查账号是否为活跃账号，如果是则直接返回
    - 调用 `window.desktop.automation.launchKiroClient` 启动客户端
    - 传递账号信息：`accountId`, `email`, `username`, `executablePath`, `workspacePath`
    - 处理启动成功：更新账号的 `kiroClientLastLaunchAt` 为当前时间
    - 处理启动失败：显示错误提示
    - _需求: REQ-002_
  
  - [x] 2.4 添加加载状态和错误处理
    - 创建 `loadingStates.switchingAccount` 响应式状态
    - 在切换过程中显示加载图标（按钮禁用 + 旋转图标）
    - 使用 try-catch 捕获错误
    - 显示成功/失败的 Toast 通知（使用现有日志系统）
    - 在非 Electron 环境下隐藏或禁用切换按钮
    - _需求: REQ-002_

- [x] 3. 检查点 - 阶段 1 验证
  - 在不同屏幕尺寸下测试布局效果
  - 测试切换账号功能是否正常工作
  - 验证活跃账号的视觉标识是否清晰
  - 确保所有测试通过，询问用户是否有问题

### 阶段 2: API 调研 + 额度细化

- [x] 4. 调研 Kiro API 额度接口
  - [x] 4.1 扩展 API 拦截逻辑
    - 修改 `electron/main.cjs` 中的 `isInterestingKiroApi` 函数
    - 添加额度相关关键词匹配：`usage`, `quota`, `credit`, `billing`, `subscription`, `entitlement`
    - 记录包含这些关键词的 API 请求和响应
    - _需求: REQ-005 (API 接口调研)_
  
  - [x] 4.2 分析 API 响应结构
    - 在 `captureKiroWebAccount` 函数中添加详细的 API 响应日志
    - 识别额度相关的字段名称（如 `subscriptionQuota`, `freeQuota`, `bonusQuota`）
    - 记录不同账号状态下的响应差异（新账号、付费账号、免费账号）
    - 创建 `api-research.md` 文档记录调研结果
    - _需求: REQ-005_
  
  - [x] 4.3 实现额度数据提取逻辑
    - 修改 `extractUsageAndModels` 函数以提取细分额度
    - 解析 API 响应，提取 `subscription`, `freeTier`, `bonus` 三类额度
    - 计算总额度：`total.used` 和 `total.total`
    - 处理 API 不提供细分数据的情况（降级到总额度）
    - 返回 `QuotaBreakdown` 对象
    - _需求: REQ-004 (额度信息细化展示), REQ-005_

- [x] 5. 扩展数据模型
  - [x] 5.1 扩展 Account 数据模型
    - 在账号对象中添加 `quotaBreakdown` 字段（可选）
    - 添加 `quotaLastSyncAt` 字段记录最后同步时间
    - 确保向后兼容：旧账号数据不包含这些字段时不报错
    - _需求: REQ-004_
  
  - [x] 5.2 扩展 AccountCenterStore
    - 添加 `refreshQuota` action 方法
    - 实现逻辑：调用 Electron IPC 获取最新额度信息
    - 更新账号的 `quotaUsed`, `quotaTotal`, `quotaBreakdown`, `quotaLastSyncAt`
    - 处理错误：额度同步功能不可用、账号不存在等
    - _需求: REQ-004_

- [x] 6. 创建 QuotaDisplay 组件
  - [x] 6.1 创建组件文件和基础结构
    - 创建 `src/components/QuotaDisplay.vue` 文件
    - 定义 Props：`account` (Account 对象)
    - 创建组件模板：额度头部、总额度、进度条、详情列表
    - _需求: REQ-004_
  
  - [x] 6.2 实现额度计算逻辑
    - 创建 `quotaBreakdown` 计算属性，处理降级方案
    - 创建 `quotaSegments` 计算属性，计算各类额度的百分比
    - 过滤掉 `total` 为 0 的额度类型
    - 为每种额度类型分配颜色：套餐(cyan)、免费(emerald)、福利(purple)
    - _需求: REQ-004_
  
  - [x] 6.3 实现分段进度条
    - 渲染多个进度条段，每段宽度为对应额度的百分比
    - 使用 Tailwind CSS 渐变色：`bg-gradient-to-r from-{color}-400 to-{color}-500`
    - 添加 tooltip 显示详细信息：`${label}: ${used}/${total}`
    - _需求: REQ-004_
  
  - [x] 6.4 实现额度刷新功能
    - 添加刷新按钮，点击时调用 `refreshQuota` 方法
    - 创建 `refreshing` 响应式状态
    - 刷新时显示加载动画（旋转图标）
    - 处理刷新失败：显示错误提示
    - _需求: REQ-004_
  
  - [x] 6.5 添加额度警告标识
    - 检查每个额度段是否用尽（`used >= total`）
    - 在用尽的额度旁边显示警告图标 ⚠️
    - _需求: REQ-004_

- [x] 7. 集成 QuotaDisplay 到 ProviderDetailView
  - [x] 7.1 导入并使用 QuotaDisplay 组件
    - 在 ProviderDetailView.vue 中导入 QuotaDisplay
    - 在账号卡片中使用 `<QuotaDisplay :account="item" />`
    - 替换现有的简单额度显示
    - _需求: REQ-004_

- [x] 8. 检查点 - 阶段 2 验证
  - 验证额度信息是否正确显示
  - 测试降级方案（无细分额度时显示总额度）
  - 测试额度刷新功能
  - 检查 API 调研文档是否完整
  - 确保所有测试通过，询问用户是否有问题

### 阶段 3: 反代配置功能

- [x] 9. 扩展数据模型支持反代配置
  - [x] 9.1 扩展 Account 数据模型
    - 在账号对象中添加 `proxyConfig` 字段（可选）
    - 定义 ProxyConfig 接口：`enabled`, `server`, `port`, `protocol`, `username`, `password`
    - _需求: REQ-003 (反代配置功能)_
  
  - [x] 9.2 扩展 AccountCenterStore
    - 添加 `setProxyConfig` action 方法
    - 实现逻辑：更新指定账号的 `proxyConfig` 字段
    - 触发 localStorage 持久化
    - _需求: REQ-003_

- [x] 10. 创建 ProxyConfigModal 组件
  - [x] 10.1 创建组件文件和基础结构
    - 创建 `src/components/ProxyConfigModal.vue` 文件
    - 定义 Props：`show` (boolean), `account` (Account | null)
    - 定义 Emits：`update:show`, `save`
    - 使用 Teleport 将模态框渲染到 body
    - 添加 Transition 动画效果
    - _需求: REQ-003_
  
  - [x] 10.2 实现表单 UI
    - 创建表单元素：启用开关、服务器地址、端口、协议、用户名、密码
    - 使用合适的输入类型：checkbox, text, number, select, password
    - 添加表单标签和占位符
    - 添加取消和保存按钮
    - _需求: REQ-003_
  
  - [x] 10.3 实现表单数据绑定
    - 创建 `formData` 响应式对象
    - 使用 v-model 绑定表单字段
    - 在组件挂载时从 `account.proxyConfig` 加载现有配置
    - _需求: REQ-003_
  
  - [x] 10.4 实现表单验证逻辑
    - 创建 `validateForm` 函数
    - 验证服务器地址不为空
    - 验证端口号在 1-65535 范围内
    - 验证协议类型为 http/https/socks5
    - 验证服务器地址格式（可选：URL 格式检查）
    - 返回错误列表
    - _需求: REQ-003_
  
  - [x] 10.5 实现保存逻辑
    - 创建 `save` 函数，处理表单提交
    - 调用 `validateForm` 进行验证
    - 验证失败时显示错误信息，阻止保存
    - 验证成功时调用 `center.setProxyConfig` 保存配置
    - 显示成功提示，关闭模态框
    - 处理保存失败：显示错误提示
    - _需求: REQ-003_
  
  - [x] 10.6 实现关闭逻辑
    - 创建 `close` 函数
    - 检查是否有未保存的更改
    - 如果有更改，提示用户确认（可选）
    - 触发 `update:show` 事件关闭模态框
    - _需求: REQ-003_

- [x] 11. 集成反代配置到 ProviderDetailView
  - [x] 11.1 添加反代按钮 UI
    - 在账号卡片右上角添加反代图标按钮（与切换按钮并列）
    - 使用合适的 SVG 图标（如齿轮或网络图标）
    - 为已配置反代的账号添加视觉标识（绿色高亮）
    - 使用 `@click.stop` 防止触发卡片选中事件
    - _需求: REQ-003_
  
  - [x] 11.2 实现反代配置触发逻辑
    - 创建 `showProxyModal` 响应式状态
    - 创建 `selectedAccountForProxy` 响应式状态
    - 创建 `openProxyConfig` 函数，设置选中账号并显示模态框
    - 绑定反代按钮的点击事件
    - _需求: REQ-003_
  
  - [x] 11.3 导入并使用 ProxyConfigModal 组件
    - 在 ProviderDetailView.vue 中导入 ProxyConfigModal
    - 在模板中添加 `<ProxyConfigModal v-model:show="showProxyModal" :account="selectedAccountForProxy" />`
    - 处理 `save` 事件（可选：显示成功提示）
    - _需求: REQ-003_

- [x] 12. 扩展 Electron IPC 支持反代
  - [x] 12.1 扩展 launchKiroClient 接口
    - 在 `electron/main.cjs` 中修改 `launchKiroClient` 函数签名
    - 添加 `proxyConfig` 参数（可选）
    - 如果提供了 `proxyConfig` 且 `enabled` 为 true，配置 Playwright 使用代理
    - 设置代理服务器、端口、协议
    - 如果提供了用户名和密码，配置代理认证
    - _需求: REQ-003_
  
  - [x] 12.2 扩展 captureKiroWebAccount 接口
    - 在 `captureKiroWebAccount` 函数中添加 `proxyConfig` 参数支持
    - 在创建浏览器上下文时应用代理配置
    - _需求: REQ-003_

- [x] 13. 检查点 - 阶段 3 验证
  - 测试反代配置表单的所有功能
  - 验证配置数据是否正确保存到 localStorage
  - 测试已配置账号的视觉标识
  - 测试表单验证逻辑
  - 确保所有测试通过，询问用户是否有问题

### 阶段 4: 集成测试 + 文档

- [x] 14. 编写单元测试
  - [x]* 14.1 测试 validateProxyConfig 函数
    - 测试空服务器地址应返回错误
    - 测试端口号超出范围应返回错误
    - 测试无效协议应返回错误
    - 测试有效配置应返回空错误列表
    - _需求: REQ-003_
  
  - [x]* 14.2 测试 isActiveAccount 函数
    - 测试 29 分钟前的账号应为活跃
    - 测试 31 分钟前的账号应为非活跃
    - 测试空 lastLaunchAt 应为非活跃
    - 测试无效日期应为非活跃
    - _需求: REQ-002_
  
  - [x]* 14.3 测试额度计算逻辑
    - 测试 quotaBreakdown 计算属性的降级方案
    - 测试 quotaSegments 百分比计算
    - 测试过滤 total 为 0 的额度类型
    - _需求: REQ-004_

- [x] 15. 编写组件测试
  - [x]* 15.1 测试 ProxyConfigModal 组件
    - 测试表单验证失败时不触发 save 事件
    - 测试表单验证成功时触发 save 事件并传递正确数据
    - 测试关闭模态框时触发 update:show 事件
    - 测试加载现有配置
    - _需求: REQ-003_
  
  - [x]* 15.2 测试 QuotaDisplay 组件
    - 测试有细分额度时显示详细信息
    - 测试无细分额度时显示总额度
    - 测试额度用尽时显示警告图标
    - 测试刷新按钮功能
    - _需求: REQ-004_
  
  - [x]* 15.3 测试 ProviderDetailView 组件
    - 测试响应式布局渲染
    - 测试切换账号按钮状态
    - 测试反代按钮视觉标识
    - _需求: REQ-001, REQ-002, REQ-003_

- [x] 16. 编写集成测试
  - [x]* 16.1 测试账号切换流程
    - 测试切换账号后 lastLaunchAt 更新
    - 测试活跃账号判定逻辑
    - 测试切换失败时的错误处理
    - _需求: REQ-002_
  
  - [x]* 16.2 测试反代配置流程
    - 测试保存配置后 localStorage 更新
    - 测试配置持久化
    - 测试配置加载
    - _需求: REQ-003_
  
  - [x]* 16.3 测试额度刷新流程
    - 测试刷新后额度数据更新
    - 测试刷新失败时的错误处理
    - _需求: REQ-004_

- [x] 17. 编写端到端测试
  - [x]* 17.1 测试完整的用户流程
    - 测试打开应用并查看账号列表
    - 测试配置反代并保存
    - 测试切换账号
    - 测试刷新额度信息
    - _需求: REQ-001, REQ-002, REQ-003, REQ-004_

- [x] 18. 更新文档
  - [x] 18.1 创建 API 调研文档
    - 记录识别出的额度相关 API 端点
    - 记录请求和响应结构
    - 记录字段映射关系
    - 记录特殊情况处理
    - _需求: REQ-005_
  
  - [x] 18.2 更新用户文档
    - 添加响应式布局说明
    - 添加账号切换功能说明
    - 添加反代配置功能说明
    - 添加额度信息说明
    - 添加常见问题解答
    - _需求: REQ-001, REQ-002, REQ-003, REQ-004_

- [x] 19. 代码审查和优化
  - [x] 19.1 代码审查
    - 检查代码风格一致性
    - 检查错误处理是否完善
    - 检查性能优化点
    - 检查安全问题（密码加密、输入验证等）
  
  - [x] 19.2 性能优化
    - 添加窗口 resize 事件防抖
    - 实现额度信息缓存（5 分钟）
    - 检查是否需要虚拟滚动（账号数量 > 100）
    - 优化组件渲染性能

- [x] 20. 最终检查点
  - 运行所有测试，确保测试覆盖率达标
  - 在不同屏幕尺寸下测试完整功能
  - 验证所有需求的验收标准
  - 检查文档完整性
  - 询问用户是否满意，是否有需要调整的地方

## 注意事项

### 任务标记说明
- 标记 `*` 的任务为可选测试任务，可以跳过以加快 MVP 开发
- 未标记 `*` 的任务为核心实现任务，必须完成

### 依赖关系
- 阶段 2 依赖阶段 1 完成（QuotaDisplay 需要在卡片中显示）
- 阶段 3 可以与阶段 2 并行开发（反代配置独立于额度功能）
- 阶段 4 依赖前三个阶段完成

### 预估工作量
- 阶段 1: 1-2 天
- 阶段 2: 2-3 天
- 阶段 3: 2-3 天
- 阶段 4: 1 天
- **总计**: 6-9 天

### 技术栈
- Vue 3 (Composition API)
- JavaScript/TypeScript
- Pinia (状态管理)
- Tailwind CSS (样式)
- Electron (桌面环境)
- Playwright (浏览器自动化)
- Vitest (单元测试)
- @vue/test-utils (组件测试)

## 任务依赖图

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2"] },
    { "id": 2, "tasks": ["2.3", "4.1", "9.1"] },
    { "id": 3, "tasks": ["2.4", "4.2", "9.2", "10.1"] },
    { "id": 4, "tasks": ["4.3", "5.1", "10.2"] },
    { "id": 5, "tasks": ["5.2", "6.1", "10.3"] },
    { "id": 6, "tasks": ["6.2", "10.4"] },
    { "id": 7, "tasks": ["6.3", "10.5"] },
    { "id": 8, "tasks": ["6.4", "10.6"] },
    { "id": 9, "tasks": ["6.5", "11.1"] },
    { "id": 10, "tasks": ["7.1", "11.2"] },
    { "id": 11, "tasks": ["11.3", "12.1"] },
    { "id": 12, "tasks": ["12.2"] },
    { "id": 13, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 14, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 15, "tasks": ["16.1", "16.2", "16.3"] },
    { "id": 16, "tasks": ["17.1"] },
    { "id": 17, "tasks": ["18.1", "18.2"] },
    { "id": 18, "tasks": ["19.1"] },
    { "id": 19, "tasks": ["19.2"] }
  ]
}
```
