# AGENTS.md — Nova 项目指导（ZCode）

> 本文件是 ZCode 的项目级指导文件，所有开发任务必须严格遵守。Claude Code 用户请看 `CLAUDE.md`（两份内容需保持同步）。

## ⚠️ 重要：语言要求

**必须使用中文**与用户进行交流

- 所有响应、解释、错误信息、技术讨论都必须使用简体中文
- 代码注释、文档、提交信息都应使用中文
- 仅在代码本身（变量名、函数名、类名）中使用英文

## 项目概述

Nova 是一款 AI 编程 CLI 工具的桌面管理客户端（Tauri 2.x），为 Claude Code / Codex CLI / Gemini CLI / OpenCode 提供图形化的 LLM 供应商管理、会话管理等"周边设施"。

**核心原则：零额外 Token 开销** — PTY 直通，不拦截/代理 API 请求。

## 技术栈（强制）

| 层 | 技术 | 版本约束 |
| --- | --- | --- |
| 桌面框架 | Tauri | 2.x（不允许 1.x） |
| 后端 | Rust | stable 工具链 |
| HTTP/WS 网关 | axum | 仅监听 127.0.0.1:49999 |
| 前端 | React + TypeScript | React 19, TS 5.x |
| UI 组件库 | shadcn/ui | Radix UI + TailwindCSS 4，源码组件进仓库（禁止整体引入 npm 组件库替代） |
| 样式 | TailwindCSS | 4.x，仅用于布局/间距/自定义样式 |
| 状态管理 | Zustand | — |
| 终端渲染 | xterm.js | — |
| 数据存储 | SQLite (rusqlite) + JSONL | — |

## 架构红线（任何时候不可违反）

1. **PTY 直通**：禁止拦截/代理/修改 CLI 工具的 API 请求；禁止向 PTY 输出注入内容
2. **Token 统计**只读 CLI 本地数据文件（JSONL/数据库），非解析 PTY 输出
3. **凭据**只走系统 Keychain（keyring）；禁止明文写入任何文件/日志/IPC 通道；日志与导出必须脱敏
4. **axum 网关仅监听 127.0.0.1**，禁止绑定 0.0.0.0
   **例外（远程访问服务）**：`remote_access` WS 服务默认**关闭**；仅当用户在设置中显式开启后方可绑定非回环地址（`0.0.0.0:<port>`），且必须强制配对码/令牌鉴权，日志与导出脱敏，不得承载凭据明文
5. **本地优先**：禁止引入云端服务端依赖
6. **跨平台**：路径用 `PathBuf`，禁止硬编码分隔符；三平台同等支持

## 启动与工具链

- 包管理必须用 **pnpm**
- 开发：`pnpm tauri dev`
- 提交前检查链：`cargo clippy -- -D warnings` + `cargo test` + `pnpm exec tsc --noEmit`

## 编码规范（摘要，细则见对应技能）

### Rust

- `Result<T, E>` 处理所有错误，**禁止** `unwrap()`（测试代码豁免）
- `thiserror` 定义错误，**禁止** `Box<dyn Error>`；异步统一 tokio
- 数据库操作用事务；公共 API 有 `///` 注释；clippy 无 warning

### TypeScript / React

- strict 模式；函数组件 + Hooks，**禁止** class 组件与 `any`
- 分层依赖单向：组件 → hooks → stores → `utils/ipc.ts`（唯一 invoke 出口）；组件**禁止**裸 invoke
- store 按领域拆分（一句话测试，**禁止**万物桶）；派生状态用 selector，**禁止**双写
- **禁止**复制同构逻辑（第二份出现即抽共享）；弹窗/确认等交互全局唯一实现
- 全局状态统一 Zustand，**禁止** Context + useReducer 替代
- **禁止** `console.log` 进生产代码；**禁止** TODO/FIXME/HACK 注释

### shadcn/ui + Tailwind

- shadcn/ui 管组件（源码在 `src/components/ui/`，可定制），颜色/圆角/阴影一律引用语义 CSS 变量（`--background`/`--primary` 等）；**禁止**硬编码色值，**禁止**深改 Radix UI 原语内部结构

### Git

- 提交信息中文，格式 `<类型>: <描述>`（如 `feat: 添加 Profile 管理界面`）
- 一个任务一个提交；禁止 force push 主分支

## 数据库规范

- 迁移放 `src-tauri/migrations/`，命名 `v{N}_description.sql`，版本递增
- **禁止** `ALTER TABLE` 删除列；所有表有 `created_at`/`updated_at`（Unix 毫秒）

## IPC 接口规范

- 命令在 `src-tauri/src/commands/`，命名 `<领域>_<动作>`（如 `profile_create`）
- 事件命名 `<领域>:<事件>`（如 `pty:output`、`cost:updated`）
- **禁止**在 IPC 通道传 API Key 明文

---

## 🔄 开发流水线（yndth-core 同款工作流）

### 流水线全景

```
/kickoff 一句话想法 → 需求文档（人工门）→ 任务台账（人工门）→ /loop dev-loop 自主循环
                                                                      ↓
/add-todo 随手记待办 ←→ doc/待办清单.md ←→ /update-status 汇总 ←→ /check 提交前检查
                                           /next 下一步建议 · /progress 进度报告
```

### 命令索引（ZCode 斜杠命令）

| 命令 | 用途 |
| --- | --- |
| `/kickoff` | 想法 → 需求 → 台账 → 起飞（特性级开发前门） |
| `/dev` | 单个功能点的标准实现流程（Rust 先行 → TS 封装 → UI → 验证） |
| `/dev-loop` | 自主循环：一轮一最小提交，按任务台账推进 |
| `/next` | 推荐一个最优下一步 + 备选方向 |
| `/progress` | 全面进度报告（只读快照） |
| `/add-todo` | 快速添加待办，自动维护 doc/待办清单.md |
| `/update-status` | 联动更新项目状态/待办清单（依据台账与 git 真实数据） |
| `/check` | 代码规范检查（rust/fe/commit 三档） |

### 文档体系（真相源）

| 文档 | 作用 |
| --- | --- |
| `doc/requirements.md` | 需求（只读输入） |
| `doc/nova-roadmap.md` | 路线图/里程碑 |
| `doc/项目状态.md` | 当前状态快照（模板：`.zcode/templates/项目状态模板.md`） |
| `doc/待办清单.md` | 待办（模板：`.zcode/templates/待办清单模板.md`） |
| `doc/tasks/active/*.md` | 任务台账，`[ ]/[x]` 进度（格式见 task-tracker 技能） |
| `doc/tasks/done/` | 已归档台账 |

### Skills 位置

`.zcode/skills/[skill-name]/SKILL.md`（共 17 个专业技能：tauri-ipc / rust-coding / react-frontend / zustand-state / shadcn-ui / macos-hig / pty-terminal / storage-sqlite / security-keychain / cost-tracking / profile / project-navigator / git-workflow / task-tracker / writing-plans / bug-detective / test-development）

每个开发任务先按影响面激活对应技能，再动手实现（hooks 会强制评估）。

## 关键依赖（Rust crate 选型锁定）

tauri 2.x / axum / portable-pty / rusqlite / keyring / serde + serde_json / tokio / thiserror / uuid / chrono — 新增依赖需说明理由。
