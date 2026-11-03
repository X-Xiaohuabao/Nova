---
name: tauri-ipc
description: |
  Tauri 2.x IPC 规范：命令定义与注册、前端 invoke 封装、事件通信、tauri.conf.json 配置。

  触发场景：
  - 新增/修改 Tauri IPC 命令或事件
  - 前端调用后端能力（invoke）
  - 事件推送（emit/listen）
  - Tauri 插件、权限、窗口、托盘、tauri.conf.json 相关
---

# Tauri IPC 规范

## 命令定义

- IPC 命令定义在 `src-tauri/src/commands/` 下，按领域分文件
- 命令命名：`<领域>_<动作>`，如 `profile_create`、`cost_get_session`
- 使用 `#[tauri::command]`，参数用 serde 结构体，**禁止**传裸 HashMap
- 返回 `Result<T, AppError>`，错误类型统一（thiserror 定义）

## 前端调用

- 通过 `@tauri-apps/api` 的 `invoke` 函数，封装到 `src/utils/` 或领域模块
- 类型定义放 `src/types/`，与 Rust 结构体字段一一对应（camelCase 映射需显式 `#[serde(rename_all = "camelCase")]`）

## 事件通信

- 事件命名：`<领域>:<事件>`，如 `pty:output`、`pty:exit`、`cost:updated`
- Rust 侧 `emit` 到前端；前端 `listen` 记得在组件卸载时 `unlisten`
- 高频数据流（PTY 输出）走事件通道，**禁止**轮询 IPC

## 命名段预留（agent 领域）

- 🔒 `agent:*` 事件命名段与 `agent_*` 命令前缀为「智能体统一接入」特性（独立立项）预留：`agent:message`（流式消息块）、`agent:state`（会话状态迁移）等为规划中的事件名
- UI 重构（shadcn 骨架）仅在 `src/types/` 预留 `AgentKind` 等占位类型与聊天视图挂载点，**不实现**任何 agent 命令/事件
- 其余特性**禁止**占用 `agent` 命名段，避免未来冲突

## 安全

- 🔴 **禁止**在 IPC 通道中传递 API Key 明文（传 Keychain 引用标识）
- axum 网关仅监听 `127.0.0.1:49999`，**禁止**绑定 0.0.0.0
- 新增命令需在 tauri.conf.json / capability 中登记权限

## 检查清单

- [ ] 命令命名符合 `<领域>_<动作>`
- [ ] 事件命名符合 `<领域>:<事件>`
- [ ] 未传明文凭据
- [ ] TS 类型与 Rust 结构体对齐
