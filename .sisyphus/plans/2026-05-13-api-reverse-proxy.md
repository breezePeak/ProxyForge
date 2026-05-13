# API 反向代理功能 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Electron 主进程中嵌入本地 HTTP API 反向代理服务器，支持 OpenAI 原生协议（`/v1/chat/completions`）和 Anthropic 原生协议（`/v1/messages`），将外部 AI 工具的 API 请求转发到对应账号的 Kiro 后端。

## 架构概览

```
外部工具 (Cursor/Windsurf/等)
    │  POST http://localhost:11434/v1/chat/completions
    │  (或 /v1/messages)
    ▼
┌─────────────────────────────────┐
│  Proxy Server (Electron Main)   │
│  - 协议解析 (OpenAI/Anthropic)   │
│  - 账号匹配 (Header / 轮询)      │
│  - 模型名映射 (Standard ↔ Kiro)  │
│  - Session 管理                  │
└───────────┬─────────────────────┘
            │  转发请求 + Session Cookies
            ▼
┌─────────────────────────────────┐
│  Kiro API Backend               │
│  (通过 Playwright context +     │
│   storageState 复用登录态)       │
└─────────────────────────────────┘
```

## 关键设计决策

1. **服务器端口**: 默认 `11434`（Ollama 风格端口，工具兼容性好），可配置
2. **请求转发方式**: 使用 Playwright 持久化上下文 + storageState 复用账号登录态，通过 `context.request` (Playwright APIRequest) 或页面拦截方式调用 Kiro 后端
3. **协议支持**: 两个独立端点，按 URL 路径自动识别：
   - `/v1/chat/completions` → OpenAI 格式
   - `/v1/messages` → Anthropic 格式
4. **账号选择**:
   - 请求头 `X-Account-Id: <accountId>` → 指定账号
   - 无请求头 → 轮询该 provider 下所有可用账号
5. **模型映射**: 维护 Standard ↔ Kiro 模型名映射表，默认自动匹配

## 文件结构

```
electron/
├── main.cjs                        # MODIFY: 启动 proxy server, 添加 IPC handlers
├── preload.cjs                     # MODIFY: 暴露 proxy 控制 API
├── proxy-server.cjs                # NEW: HTTP 服务器核心 (路由、协议分发)
├── proxy-openai.cjs                # NEW: OpenAI 协议处理 (请求解析/响应格式化)
├── proxy-anthropic.cjs             # NEW: Anthropic 协议处理 (请求解析/响应格式化)
├── proxy-session.cjs               # NEW: Playwright session 复用管理
├── proxy-router.cjs                # NEW: 请求转发到 Kiro 后端
└── model-mapper.cjs                # NEW: 模型名映射

src/
├── stores/proxyServer.js           # NEW: Pinia store (proxy server 状态)
├── components/ProxyServerPanel.vue # NEW: Proxy 服务器控制面板 UI
└── views/ProviderDetailView.vue    # MODIFY: 集成 proxy 状态显示

.sisyphus/
└── plans/2026-05-13-api-reverse-proxy.md  # 本计划
```

---

## Phase 1: API 协议探索 (Exploration)

> **目标**: 确认 Kiro 的实际 Chat Completion API 格式，以便正确转发请求

- [ ] **Task 1.1**: 使用 Playwright 打开已登录的 Kiro 页面，手动触发一次对话
  - 记录 Network 面板中的 chat/completion API 请求
  - 分析请求/响应格式（URL、Headers、Body、Response）
  - 输出文档：`docs/kiro-api-format.md`
  
- [ ] **Task 1.2**: 探索 Kiro 是否有 OpenAI-compatible 端点
  - 尝试请求 `https://api.kiro.dev/v1/chat/completions`（或其他变体）
  - 检查 `discoveredApis` 中是否已有 chat 相关端点
  - 验证认证方式（SSO Cookie 是否可直接用于 API 调用）

- [ ] **Task 1.3**: 实现 Playwright 请求转发原型
  - 创建 `electron/proxy-session.cjs`：管理持久化 browser context
  - 验证通过 `context.request` 或 page.evaluate 方式能否直接调用 Kiro API
  - 验证 SSO session cookie 复用是否有效

## Phase 2: 核心代理服务器 (Implementation)

- [ ] **Task 2.1**: 创建 `electron/proxy-server.cjs` - HTTP 服务器框架
  - 使用 Node.js 内置 `http` 模块，零额外依赖
  - 支持 `HOST`、`PORT` 环境变量 / 配置
  - 基础路由：`/v1/chat/completions`、`/v1/messages`
  - 健康检查：`/health`
  - 模型列表：`/v1/models`
  - CORS 支持（允许所有来源，方便工具集成）
  - 请求日志记录

- [ ] **Task 2.2**: 创建 `electron/proxy-router.cjs` - 请求转发层
  - 解析请求头 `X-Account-Id`（指定账号）或自动轮询
  - 查找账号的 Playwright session
  - 转发请求到 Kiro 后端（基于 Phase 1 发现的 API 格式）
  - 超时处理（默认 120s，支持 `X-Timeout` 自定义）
  - 错误处理与标准错误响应格式

- [ ] **Task 2.3**: 创建 `electron/proxy-openai.cjs` - OpenAI 协议
  - 请求解析：提取 model, messages, stream, temperature 等字段
  - 模型名映射：`gpt-4o` → Kiro 对应模型
  - 响应格式化：`{ choices: [{ message: { content, role }, finish_reason }], usage, ... }`
  - Streaming 支持（SSE 格式 `data: ...\n\n`）
  - 支持的端点：
    - `POST /v1/chat/completions`
    - `GET /v1/models`
    - `POST /v1/embeddings` (可选，视 Kiro 是否支持)

- [ ] **Task 2.4**: 创建 `electron/proxy-anthropic.cjs` - Anthropic 协议
  - 请求解析：提取 model, messages, max_tokens, stream 等字段
  - 模型名映射：`claude-sonnet-4-20250514` → Kiro 对应模型
  - 响应格式化：`{ id, type: "message", content: [{ type: "text", text }], usage, ... }`
  - Streaming 支持（SSE 格式）
  - 支持的端点：
    - `POST /v1/messages`
    - `GET /v1/models` (可选)

- [ ] **Task 2.5**: 创建 `electron/model-mapper.cjs` - 模型映射
  - 维护映射表：OpenAI 模型名 ↔ Anthropic 模型名 ↔ Kiro 模型名
  - 智能模糊匹配：`claude` → 找到最匹配的 Kiro Claude 模型
  - 默认映射规则：
    ```
    OpenAI "gpt-4o"        → Kiro "Auto"
    Anthropic "claude-*"   → Kiro "Claude Sonnet 4.6"
    DeepSeek "deepseek-*"  → Kiro "DeepSeek 3.2"
    ```
  - 支持自定义映射配置（暂用 hardcoded，后续可扩展）

- [ ] **Task 2.6**: 创建 `electron/proxy-session.cjs` - Session 管理
  - 管理多个 Playwright BrowserContext（每个账号一个）
  - Lazy initialization + 连接池
  - Session 有效性检查（定期验证 Cookie 未过期）
  - 自动重启过期 session
  - 并发请求控制（同一账号最多 5 个并发请求排队）

## Phase 3: Electron 主进程集成

- [ ] **Task 3.1**: 修改 `electron/main.cjs` - 集成 proxy server
  - `app.on('ready')` 时启动 proxy server
  - `app.on('before-quit')` 时优雅关闭（等待进行中的请求完成）
  - 添加 IPC handlers：
    - `proxy:getStatus` → 返回 server 状态（running/stopped, port, active sessions）
    - `proxy:start` → 启动 server
    - `proxy:stop` → 停止 server
    - `proxy:getConfig` → 获取配置
    - `proxy:updateConfig` → 更新配置（port 等）
  - 配置持久化到 Electron userData

- [ ] **Task 3.2**: 修改 `electron/preload.cjs` - 暴露 API
  - 新增 `desktop.proxy` 命名空间：
    ```javascript
    proxy: {
      getStatus: () => ipcRenderer.invoke('proxy:getStatus'),
      start: () => ipcRenderer.invoke('proxy:start'),
      stop: () => ipcRenderer.invoke('proxy:stop'),
      getConfig: () => ipcRenderer.invoke('proxy:getConfig'),
      updateConfig: (cfg) => ipcRenderer.invoke('proxy:updateConfig', cfg)
    }
    ```

## Phase 4: 前端 UI

- [ ] **Task 4.1**: 创建 `src/stores/proxyServer.js` - Pinia Store
  - 状态：`running`, `port`, `activeSessions`, `requestCount`, `error`
  - Actions：`fetchStatus()`, `start()`, `stop()`, `updateConfig()`
  - 定期轮询状态（每 5 秒）

- [ ] **Task 4.2**: 创建 `src/components/ProxyServerPanel.vue` - 控制面板
  - 服务器状态指示器（绿=运行中，红=已停止）
  - 端口显示与配置
  - 启动/停止按钮
  - 请求计数统计
  - 活跃 Session 列表
  - 快速复制连接字符串（`http://localhost:11434/v1`）
  - 样式：Cyberpunk/Neon 风格，与现有 UI 一致

- [ ] **Task 4.3**: 修改 `src/views/ProviderDetailView.vue`
  - 在页面顶部/侧边添加 ProxyServerPanel 组件的缩略版（状态指示灯 + 端口）
  - 账号卡片上显示"可用于反代"标记

## Phase 5: 测试与验证

- [ ] **Task 5.1**: 单元测试 - Proxy 路由
  - 测试 `proxy-router.cjs` 的账号选择和轮询逻辑
  - 测试 `model-mapper.cjs` 的映射规则

- [ ] **Task 5.2**: 集成测试 - 端到端 API 调用
  - 使用 curl 验证 OpenAI 协议：`curl -X POST http://localhost:11434/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}]}'`
  - 使用 curl 验证 Anthropic 协议：`curl -X POST http://localhost:11434/v1/messages -H "Content-Type: application/json" -d '{"model":"claude-sonnet-4-20250514","max_tokens":100,"messages":[{"role":"user","content":"hello"}]}'`
  - 验证 Streaming (SSE) 模式
  - 验证 `X-Account-Id` 指定账号

- [ ] **Task 5.3**: 性能测试
  - 验证延迟 < 500ms (local proxy overhead)
  - 验证 5 并发请求不阻塞

## 依赖项

**无新增 npm 依赖**。全部使用 Node.js 内置模块 + 项目已有的 Playwright：

- `http` - Node.js 内置，HTTP 服务器
- `url` - URL 解析
- `playwright` - 已有依赖，用于 session 管理和 API 请求

## 风险与注意事项

1. **Kiro API 格式未知**: Phase 1 是核心前置条件。如果 Kiro 没有可直接调用的 REST API，可能需要回退到基于 Playwright page.evaluate 的方式（性能会显著下降）
2. **Session 过期**: SSO Cookie 有效期有限，需要自动刷新机制
3. **并发限制**: Kiro 可能限制同一账号的并发请求数
4. **安全**: localhost 代理仅在本地可访问，但仍需注意不要暴露到公网
5. **兼容性**: 不同 AI 工具对 OpenAI/Anthropic API 的兼容性有细微差异，需要在验证阶段覆盖主流工具
