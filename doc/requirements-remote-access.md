# 需求文档 — 远程访问：WS 服务端（局域网阶段）

最后更新: 2026-11-03 23:00

## 📋 特性概述

- **特性名称**: 远程访问 — WS 服务端（局域网阶段）
- **特性描述**: 本地 Tauri 应用内嵌一个默认关闭的 WebSocket 服务，手机/网页端（web-remote 运行时）经局域网连接后加载同一套 UI，通过 `src/lib/bridge/ws-bridge.ts` 已定义的帧协议操作应用；外网穿透（公网访问）**本阶段明确不做**。
- **特性类型**: 新功能开发
- **涉及端**: Rust 后端（新模块 `remote_access`）+ 前端（设置页 UI 与 WS 连接对接）

## 与 UI 重构特性的边界

- UI 重构（doc/requirements-ui-refactor.md）负责：桥接客户端（已完成 T16）、设置页 RemoteAccessPage 的迁移外壳（T10）
- 本特性负责：WS 服务端全部逻辑、配置持久化、鉴权、帧协议对接、设置 UI 的功能落地（面板随 T10 迁移时渲染）

## 1. 功能需求

### 1.1 Rust 后端（src-tauri/）

#### REQ-R01: 远程访问配置持久化
- **优先级**: 高
- **描述**: 持久化远程访问配置：`enabled`（默认 false）、`port`（默认 47001）、配对会话令牌哈希（RA4 用，可空）。~~新增 SQLite 表~~ → **实现时发现 v7 已有 `app_settings` 键值表，复用之（key: `remote_enabled` / `remote_port`），无需新迁移**；新增 IPC 命令 `remote_get_config` / `remote_set_config`；`enabled` 变更时启动/停止 WS 服务（RA3）。
- **涉及模块**: remote_access、storage（复用 app_settings，无迁移）、commands
- **IPC 接口**: `remote_get_config`、`remote_set_config`
- **依赖**: 无
- **验收标准**: 键缺失回落默认（关闭）；读写持久化生效且事务原子；clippy -D warnings + 单测通过。

#### REQ-R02: WS 服务骨架（帧协议收发）
- **优先级**: 高
- **描述**: `src-tauri/src/remote_access/` 模块：axum WS 服务，`enabled=true` 时随应用启动监听 `0.0.0.0:<port>`；实现与前端 ws-bridge 对齐的帧协议——`invoke` 帧（请求/结果，id 匹配）、`event` 帧（单向推送）；命令走**白名单注册表**（`HashMap<cmd, Handler>`），本阶段仅注册 `remote_ping` 测试命令；`GET /` 服务前端静态资源（vite build 产物，供手机浏览器加载 UI）。
- **涉及模块**: remote_access
- **IPC 接口**: 无新增（服务生命周期由 R01 的 set_config 驱动）
- **依赖**: REQ-R01
- **验收标准**: 手机/浏览器 `ws://<局域网IP>:<port>` 可连接；发送 `remote_ping` invoke 帧收到正确 result 帧；`enabled=false` 时端口不监听；cargo clippy -D warnings 通过。

#### REQ-R03: 配对鉴权
- **优先级**: 高（🔴 安全强制项，与 R02 同批交付）
- **描述**: WS 连接建立后第一条消息必须是 `auth` 帧（携带 6 位配对码）；配对码在开启远程访问时生成并展示于设置面板，5 分钟有效、每次开启重新生成；校验通过后签发会话令牌（随机 128bit，存哈希）并回 `auth_ok` 帧，此后帧才被处理；失败 3 次断连并冷却 30 秒；所有日志不含配对码/令牌明文。
- **涉及模块**: remote_access
- **IPC 接口**: `remote_get_pairing_code`（读取当前有效配对码，供设置面板展示）
- **依赖**: REQ-R02
- **验收标准**: 无 auth 帧直接发 invoke 被拒绝；错误配对码 3 次断连；日志 grep 无明文码/令牌。

#### REQ-R04: 设置面板功能落地（前端）
- **优先级**: 中
- **描述**: RemoteAccessPage（T10 迁移后的新组件）实现：开关（联动启停）、端口设置、配对码展示（5 分钟倒计时）、服务状态（运行中/已关闭/监听地址）；连接测试按钮（本机回环自测 invoke）。
- **涉及组件**: src/components/settings/（RemoteAccessPage 新实现）
- **状态管理**: 复用现有设置 store 模式
- **依赖**: REQ-R01、REQ-R03、UI 重构 T10
- **验收标准**: 开关开启→手机同局域网浏览器打开 `http://<IP>:<port>` 能加载 UI 并完成配对；`remote_ping` 全链路通。

### 1.2 前端（src/）— 委托说明

桥接客户端（ws-bridge）已完成（UI 重构 T16）；本特性前端侧仅 REQ-R04 设置面板，且随 UI 重构 T10 排期执行。

## 2. 非功能需求

### 2.1 架构红线核对

- [x] 不拦截/代理 PTY 或 API 请求（WS 通道仅转发 UI 已有的 IPC 命令白名单，白名单不含凭据读取类命令）
- [x] 凭据不落明文（配对码 5 分钟过期；会话令牌仅存哈希；日志脱敏——红线条款示明）
- [x] axum 内部网关仍仅 127.0.0.1（不变）；remote_access 服务的非回环监听遵循新增红线条款（默认关闭 + 显式开启 + 强制鉴权）
- [x] 不引入云端服务端依赖（局域网直连；外网穿透延后且不在本阶段）
- [x] 跨平台（tokio/axum 三平台等价）

### 2.2 性能要求

- WS 命令往返 < 200ms（局域网）
- 事件推送延迟 < 100ms
- 服务关闭时不残留监听端口

### 2.3 兼容性

- 配置表迁移遵循 v{N} 递增规范，不破坏现有数据
- 前端 ws-bridge 协议字段向后兼容（只增不改）

## 3. 技术方案

- **方案概述**: 独立 `remote_access` 模块（不复用未来内部网关 49999）；axum 0.8 + tokio；帧协议与前端 ws-bridge/types.ts 对齐（invoke/result/event + 本阶段新增 auth 帧）；命令白名单注册表逐特性扩充（凭据类命令永不入表）。
- **数据结构变更**: 新迁移 `v{N}_remote_access_config.sql`（remote_access_config 表）
- **新增依赖**: 无（axum/tokio/serde 已就位；uuid 已有——令牌生成复用）
- **风险与权衡**: 0.0.0.0 暴露面靠「默认关闭 + 配对码 + 命令白名单 + 令牌哈希」四层缓解；局域网明文传输（无 TLS）在本阶段接受，外网穿透阶段必须引入 TLS 后再评估；命令白名单防止远程端读取凭据（get_profile_credential 等永不入表）。

## 4. 边界（明确不做什么）

- **不做** 外网穿透/公网访问（frp/tailscale 等方案后续另议）
- **不做** 多用户/多设备并发配对（本阶段单设备语义，多设备后续扩展）
- **不做** TLS（局域网阶段接受明文；穿透阶段强制重新评估）
- **不做** 凭据类命令的远程暴露（get_profile_credential / store_profile_credential / llm_provider_get_api_key 永久禁止入白名单）
- **不做** PTY 终端流的远程转发（终端远程观看属后续阶段，涉及高频帧与安全评估）
