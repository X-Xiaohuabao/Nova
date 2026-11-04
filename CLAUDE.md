# CLAUDE.md — Nova 项目指导

> 本文件是 Claude Code 的项目级指导文件，所有开发任务必须严格遵守本文件中的约束和规范。

## ⚠️ 重要：语言要求

**必须使用中文**与用户进行交流

- 所有响应、解释、错误信息、技术讨论都必须使用简体中文
- 代码注释、文档、提交信息都应使用中文
- 仅在代码本身（变量名、函数名、类名）中使用英文

## 项目概述

Nova 是一款 AI 编程 CLI 工具的桌面管理客户端（Tauri 2.x），为 Claude Code / Codex CLI / Gemini CLI / OpenCode 提供图形化的LLM供应商管理、会话管理等"周边设施"。

**核心原则：零额外 Token 开销** — PTY 直通，不拦截/代理 API 请求。

## 技术栈（强制）

| 层          | 技术                        | 版本约束                |
| ---------- | ------------------------- | ------------------- |
| 桌面框架       | Tauri                     | 2.x（不允许 1.x）        |
| 后端         | Rust                      | stable 工具链          |
| HTTP/WS 网关 | axum                      | 内部网关仅监听 127.0.0.1:49999；remote_access WS 服务默认关闭，显式开启后方可绑定非回环地址且强制鉴权 |
| 前端         | React + TypeScript        | React 19, TS 5.x    |
| UI 组件库     | shadcn/ui                   | Radix UI + TailwindCSS 4，源码组件进仓库 |
| 样式         | TailwindCSS               | 4.x，仅用于布局/间距/自定义样式  |
| 状态管理       | Zustand                   | —                   |
| 终端渲染       | xterm.js                  | —                   |
| 数据存储       | SQLite (rusqlite) + JSONL | —                   |

## 项目结构（强制，详细地图见 project-navigator 技能）

```
src-tauri/src/          # Rust 后端
├── pty/                # PTY 终端管理（portable-pty）
├── cli/                # CLI 工具检测与启动
├── profile/            # Profile 管理（CLAUDE_CONFIG_DIR 隔离）
├── cost/               # Token 费用追踪（CostProvider trait + 各 CLI 适配）
├── storage/            # SQLite + JSONL 存储
├── crypto/             # 凭据加密
├── commands/           # Tauri IPC 命令
├── session*/           # 会话/分类/消息
├── ssh/                # SSH + sFTP
├── llm_provider/       # LLM 供应商管理
├── tool_settings/      # 各 CLI 工具设置
└── main.rs / lib.rs / tray.rs
src/                    # React 前端
├── components/         # terminal/tabs/settings/chat/layout/shell/panes/...
├── stores/             # Zustand stores（appStore/agentStore/themeStore/shellStore）
├── types/              # TS 类型（与 Rust 结构体对齐）
├── utils/              # 工具（ipc.ts 唯一 invoke 出口等）
└── themes/             # 主题
doc/                    # 文档（需求/路线图/任务台账/状态）
.claude/ + .zcode/      # Claude Code / ZCode 工作区配置（命令/技能/hooks，两端保持同步）
```

## 架构约束

### 1. PTY 直通

- **禁止**拦截、代理或修改 CLI 工具的 API 请求
- **禁止**在 PTY 输出流中注入额外内容
- Token 统计通过读取 CLI 本地数据文件，**非解析 PTY 输出**

### 2. 本地优先

- 所有数据存储在本地（SQLite + JSONL）
- **禁止**引入任何云端服务端依赖
- 网络请求仅限于：CLI 工具自身的 API 调用、费用探活、版本检查

### 3. 安全

- API Key / OAuth Token **必须**通过系统 Keychain 存储（keyring crate）
- **禁止**将 API Key 明文写入 SQLite、JSONL、日志或任何文件
- axum 网关**仅监听 127.0.0.1**，禁止绑定 0.0.0.0
- **例外（远程访问服务）**：`remote_access` WS 服务默认**关闭**；仅当用户在设置中显式开启后方可绑定非回环地址，且必须强制配对码/令牌鉴权，日志与导出脱敏
- 日志中所有 API Key 必须脱敏（显示 `sk-***...` 格式）
- Profile 导出时 API Key 必须脱敏

### 4. 跨平台

- 路径处理使用 Rust `PathBuf`，**禁止**硬编码 `/` 或 `\` 分隔符
- 文件操作使用 `std::fs`，**禁止**直接 `shell out` 到 `cp`/`rm`/`mv`
- Windows / macOS / Linux 三平台必须同等支持

### 5. shadcn/ui + TailwindCSS

- shadcn/ui 负责 UI 组件（按钮、表单、弹窗、下拉等），源码组件进仓库（`src/components/ui/`），可自由定制
- 颜色/圆角/阴影一律引用语义 CSS 变量（`--background`/`--primary`/`--border` 等），**禁止**硬编码色值
- **禁止**深改 Radix UI 原语内部结构；定制通过 className / variant（CVA）进行

## 启动命令

- pnpm tauri dev
- 必须使用pnpm包来管理

## 编码规范

### Rust

- 使用 `Result<T, E>` 处理所有错误，**禁止** `unwrap()` 在非测试代码中使用
- 使用 `thiserror` 定义错误类型，**禁止** `Box<dyn Error>` 作为返回类型
- 异步运行时使用 `tokio`，**禁止**混用 `async-std`
- 数据库操作使用事务（`transaction`），确保原子性
- 公共 API 必须有文档注释（`///`），内部函数不需要
- `cargo clippy` 必须无 warning

### TypeScript / React

- 严格模式：`"strict": true` in tsconfig.json
- 函数组件 + Hooks，**禁止** class 组件
- Props 必须定义 interface/type，**禁止** `any`
- 分层依赖单向：组件 → hooks → stores → `utils/ipc.ts`（唯一 invoke 出口）；组件**禁止**裸 invoke
- store 按领域拆分（一句话测试，**禁止**万物桶）；派生状态用 selector，**禁止**双写
- **禁止**复制同构逻辑（第二份出现即抽共享）；弹窗/确认等交互全局唯一实现
- 状态管理统一使用 Zustand，**禁止** Context + useReducer 替代全局状态
- 组件文件使用 PascalCase，工具文件使用 camelCase
- **禁止** `console.log` 在生产代码中，开发调试用 `console.debug` 并在提交前清理

### 通用

- **禁止**注释描述"做了什么"（代码本身应自解释）
- 仅在 WHY 不明显时添加注释（隐藏约束、不变量、特殊 workaround）
- **禁止** TODO/FIXME/HACK 注释，要么现在解决要么创建 issue
- Git commit message 使用中文，格式：`<类型>: <描述>`，如 `feat: 添加 Profile 管理界面`

## 数据库规范

- SQLite schema 版本化，从 v1 开始，每次变更递增
- 迁移脚本放在 `src-tauri/migrations/` 目录，命名 `v{N}_description.sql`
- **禁止** `ALTER TABLE` 删除列，使用新增列 + 代码层忽略的方式
- 所有表必须有 `created_at` / `updated_at` 字段（INTEGER，Unix 时间戳毫秒）

## IPC 接口规范

- Tauri IPC 命令定义在 `src-tauri/src/commands/` 下
- 命令命名：`<领域>_<动作>`，如 `profile_create`、`cost_get_session`
- 前端调用通过 `@tauri-apps/api` 的 `invoke` 函数
- 事件命名：`<领域>:<事件>`，如 `pty:output`、`pty:exit`、`cost:updated`
- **禁止**在 IPC 通道中传递 API Key 明文

## 关键依赖

| Crate              | 用途          |
| ------------------ | ----------- |
| tauri 2.x          | 桌面框架        |
| axum               | HTTP/WS 网关  |
| portable-pty       | PTY 伪终端     |
| rusqlite           | SQLite 操作   |
| keyring            | 系统 Keychain |
| serde + serde_json | 序列化         |
| tokio              | 异步运行时       |
| thiserror          | 错误类型        |
| uuid               | ID 生成       |
| chrono             | 时间处理        |

## 🔄 开发流水线

### 流水线全景

```
/kickoff 一句话想法 → 需求文档（人工门）→ 任务台账（人工门）→ /dev-loop 自主循环
                                                                      ↓
/add-todo 随手记待办 ←→ doc/待办清单.md ←→ /update-status 汇总 ←→ /check 提交前检查
                                           /next 下一步建议 · /progress 进度报告
```

### 命令索引（Claude Code 斜杠命令）

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
| `doc/项目状态.md` | 当前状态快照（模板：`.claude/templates/项目状态模板.md`） |
| `doc/待办清单.md` | 待办（模板：`.claude/templates/待办清单模板.md`） |
| `doc/tasks/active/*.md` | 任务台账，`[ ]/[x]` 进度（格式见 task-tracker 技能） |
| `doc/tasks/done/` | 已归档台账 |

### Skills 位置

`.claude/skills/[skill-name]/SKILL.md`（与 `.zcode/skills/` 保持同步；共 17 个专业技能：tauri-ipc / rust-coding / react-frontend / zustand-state / shadcn-ui / macos-hig / pty-terminal / storage-sqlite / security-keychain / cost-tracking / profile / project-navigator / git-workflow / task-tracker / writing-plans / bug-detective / test-development）

每个开发任务先按影响面激活对应技能，再动手实现（UserPromptSubmit hook 会强制评估）。

### 开发流程要点

1. 每个 Tauri IPC 命令先在 Rust 侧实现，再在 TS 侧封装调用（invoke 统一走 `utils/ipc.ts`）
2. 每个功能模块完成后立即手动验证，不累积到最终
3. 提交前检查链：`cargo clippy -- -D warnings` + `cargo test` + `pnpm exec tsc --noEmit`
4. 一个任务一个提交；禁止 force push 主分支
