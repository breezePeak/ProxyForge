# All2API Desktop

All2API Desktop 是一个基于 `Vue 3`、`Vite`、`Tailwind CSS` 和 `Electron` 的桌面端账号自动化管理工具。当前重点支持 Kiro / AWS Builder ID 注册链路，提供账号创建、邮箱接码、浏览器流程预览、指纹注入和本地账号落盘能力。

## 功能概览

- Kiro 登录页自动选择 `Builder ID` 注册入口。
- AWS Builder ID 注册流程自动填写邮箱、姓名、验证码和密码。
- 支持临时邮箱自动创建与验证码轮询。
- 支持随机浏览器指纹注入，降低批量流程中的环境重复度。
- 注册过程提供实时日志和浏览器截图预览。
- 成功注册后记录账号、邮箱、姓名、密码和 token 预览。
- 账号数据同时保存到应用状态和本地 JSON 文件。

## Kiro 注册流程

当前自动化流程按真实页面顺序执行：

1. 打开 `https://app.kiro.dev/signin`。
2. 点击 Kiro 登录方式中的 `Builder ID`。
3. 进入 AWS Builder ID 页面，填写邮箱并点击 `Continue`。
4. 填写随机姓名，等待 5 秒后点击 `Continue`。
5. 从邮箱获取 6 位验证码，填写后点击 `Continue`。
6. 随机生成包含数字、大写字母、小写字母的密码，并填写两次。
7. 根据页面提示完成授权确认与 `Allow access`。
8. 等待 Kiro 授权 Cookie 稳定后写入账号记录。

## 本地账号文件

成功注册的账号会写入 Electron 应用数据目录：

```text
~/Library/Application Support/All2API/accounts.json
```

记录字段包括：

```json
{
  "providerId": "kiro",
  "email": "example@domain.com",
  "username": "kiro_...",
  "fullName": "Alex Chen",
  "password": "Abc123...",
  "ssoCookieName": "x-amz-sso_authn",
  "ssoTokenPreview": "...",
  "createdAt": "2026-04-28T00:00:00.000Z"
}
```

应用界面仍会使用 `localStorage` 保存前端状态；本地 JSON 文件用于长期留存账号密码。

## 技术栈

- `Electron`：桌面应用外壳与主进程自动化能力。
- `Vue 3`：前端界面。
- `Pinia`：账号中心和配置状态管理。
- `Vite`：开发和构建工具。
- `Tailwind CSS`：界面样式。
- `Playwright`：浏览器自动化注册流程。

## 环境要求

- Node.js 18 或更高版本。
- npm。
- 可访问 Kiro、AWS Builder ID 和所选临时邮箱服务的网络环境。

## 安装依赖

```bash
npm install
```

## 开发启动

```bash
npm run dev
```

该命令会同时启动 Vite 前端服务和 Electron 桌面应用。

## 构建前端

```bash
npm run build
```

## 打包桌面应用

```bash
npm run build:desktop
```

## 目录说明

```text
electron/             Electron 主进程、preload 和自动化逻辑
src/                  Vue 前端源码
src/stores/           Pinia 状态管理
src/views/            页面视图
scripts/              开发辅助脚本
dist/                 前端构建产物
```

## 注意事项

- 请只在你有权限的网站和账号体系中使用本工具。
- 临时邮箱服务可能受网络、频率和服务可用性影响。
- 账号密码会以明文写入本地 JSON 文件，请注意本机文件权限和数据安全。
- AWS / Kiro 页面结构可能调整，如果选择器失效，需要同步更新自动化流程。
