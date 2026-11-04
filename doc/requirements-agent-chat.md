# 需求文档：智能体统一聊天接入（一阶段）

- 版本: v1.0（2026-11-04）
- 状态: 待人工门确认（/kickoff 阶段一产出）
- 关联:
  - UI 设计规范: `doc/design-agent-chat.md` v1.0（已定义，本文档只引用不重复）
  - 待办登记: `doc/待办清单.md` 低优先级「智能体统一聊天接入（独立立项）」→ 本次正式立项
  - 功能点: `doc/功能点清单.md` I3 / B3 / B4
  - 挂载点: `src/components/chat/ChatPlaceholder.tsx`（已预留）

## 1. 背景

用户希望聊天式对话框接管智能体（Claude Code / Codex / Gemini / OpenCode）会话。核心顾虑：TUI 交互式选择（权限确认、AskUserQuestion、Plan 确认）是"画"在终端里的画面，自定义聊天框转发（写 stdin / 读 stdout）无法可靠处理。

**本次拍板**（2026-11-04 会话讨论结论）：走**结构化协议直连**路线——不走 PTY、不解析终端画面，用各 CLI 的 headless 结构化协议（NDJSON over stdio），交互式选择在协议层是结构化事件（权限询问 → 事件 → 按钮卡片 → 结构化应答回写）。业界同款做法（Claude Code 官方 VS Code 扩展、Conductor、Sculptor、Happy Coder 均基于 Agent SDK / stream-json）。终端视图永久保留为兜底（同会话可切换，B3 决策）。

## 2. 一阶段范围（Claude Code 单家先行）

- **Driver**: 仅 Claude（协议最完整，PoC → MVP 一步到位）。Codex / Gemini / OpenCode 属后续阶段，Driver trait 设计时预留扩展点即可
- **通道**: `claude -p --input-format stream-json --output-format stream-json` 双向子进程（Rust 直连 stdio，不引入 Node sidecar）
- **UI**: 按 `design-agent-chat.md` 的 MVP 范围 + 本文 §5 权限/问题卡片
- **终端切换**: 会话内右上角视图切换控件（聊天 ⇄ 终端），聊天为默认形态

## 3. 调研要点（含来源）

### 3.1 协议事实（已核实）

| 事实 | 来源 |
| --- | --- |
| headless 子进程模式官方支持：`-p` + `--output-format json`（stream-json 为其流式变体，CLI 参考 `--input-format` text/stream-json） | [Agent SDK 官方文档](https://code.claude.com/docs/en/agent-sdk/overview)、[CLI 参考](https://www.runoob.com/claude-code/claude-code-cli-ref.html) |
| SDKMessage 联合类型：`system`（init，含 capabilities/版本）/ `assistant`（content blocks + usage）/ `user` / `result`（turn 结束，含 cost/duration/is_error）/ `stream_event`（增量，需 includePartialMessages） | [TS SDK 参考](https://code.claude.com/docs/en/agent-sdk/typescript) |
| 流式输入多轮：stdin 保持打开，user 消息结构 `{type:"user", message:{role:"user",content}, parent_tool_use_id}` | 同上 |
| 权限确认：`canUseTool` 回调 → `PermissionResult`（`behavior: allow` 带 updatedInput / `deny` 带 message+interrupt），仅权限流程落到"需要提示"时触发 | 同上 |
| 中断：`interrupt()` 仅流式输入模式可用，v2.1.205+ 回执含排队消息快照 | 同上 |
| 官方 VS Code 扩展即聊天式 GUI，走同一套协议；第三方桌面客户端（Conductor/Sculptor/Happy）同路线 | 公开产品形态 |

### 3.2 待确认（PoC 验证项）

- 🔶 **子进程模式的权限询问流**：TS SDK 的 canUseTool 底层是 CLI 子进程 `stream-json` 通道上的 `control_request`/`control_response`（该控制协议为社区整理，官方未稳定承诺）。PoC 须实测：权限事件形态、应答格式、allow-with-updatedInput 是否可用
- 🔶 兜底预案：若 control 流不可用，降级为 `--permission-mode`（acceptEdits/plan 等）+ `--allowedTools` 规则预设，权限卡片先做"只读提示 + 建议切终端确认"
- 🔶 `--include-partial-messages` 在双向模式下的实际 delta 事件形态（打字机效果的输入）
- 🔶 斜杠命令文本透传在 headless 双向模式下的覆盖范围（v0 只透传不登记，用户自行输入）

## 4. 架构影响面

### 4.1 Rust（先行）

| 项 | 内容 |
| --- | --- |
| 新模块 `src-tauri/src/agent/` | `mod.rs`（AgentDriver trait + 工厂）、`claude.rs`（ClaudeDriver：spawn + NDJSON 读写线程/任务 + 事件映射） |
| 统一事件模型 | Driver 输出归一为 `AgentEvent`：MessageDelta / MessageComplete / ToolUse / PermissionRequest / StateChange / Usage / Error / SessionEnded |
| IPC `src-tauri/src/commands/agent.rs` | `agent_session_start` / `agent_send` / `agent_interrupt` / `agent_session_stop`（命名 `<领域>_<动作>`） |
| 事件 | `agent:message` / `agent:state`（design doc §1 已定名），payload 含 sessionId |
| 复用 | Profile 数据隔离 + Keychain 凭据 + LLM Provider 注入：从 `commands/pty.rs` 抽共享函数（环境组装部分），两条通道共用，禁止复制粘贴 |
| CLI 检测 | 复用 `cli/detector.rs`；版本探测用于协议兼容性提示 |

### 4.2 前端

| 项 | 内容 |
| --- | --- |
| 视图 | `ChatPlaceholder` 替换为真实 `ChatView`（消息流 + 输入区 + 空态），挂载点不变 |
| 组件 | 按 design doc §3：非对称消息（用户气泡 / AI 全宽）、工具折叠卡片、错误卡片、权限/问题卡片（新增，见 §5） |
| 状态 | `src/stores/agentStore.ts`（Zustand）：会话状态机 idle/thinking/waiting_input/error、消息列表、流式缓冲 |
| 共享 | `transcript/MarkdownBody` 抽为 `src/components/markdown/` 共享组件（design doc §5，禁止复制两份） |
| 通道 | 全部走 `src/lib/bridge`（invoke/listen），web-remote 远程端自动获得能力 |
| 类型 | `src/types/` 增加 AgentEvent / AgentSessionState 等与 Rust 对齐 |

### 4.3 存储

- 会话沿用现有 session 表；MVP 消息落库复用 `session_message`（用户消息 + AI 最终文本），工具卡片不落库
- 不新增 SQLite 迁移（如后续需要工具卡片持久化，二阶段再议）

## 5. 权限/问题卡片（本立项新增的交互需求，design doc 未覆盖）

design doc §7 的 `waiting_input` 状态落地为两类结构化卡片：

| 卡片 | 触发 | 形态 | 应答 |
| --- | --- | --- | --- |
| **权限确认卡** | PermissionRequest 事件 | 工具名 + 参数摘要（命令/Bash 内容等危险参数显式展示）+ [允许] [拒绝]（如协议支持加 [总是允许]） | control_response：allow(带/不带 updatedInput) / deny(message) |
| **问题选择卡** | AskUserQuestion 类 tool_use | 问题文本 + 选项按钮组 + 自由输入框（Other） | 组装 tool_result 文本写回输入流 |

- 卡片出现时进入 `waiting_input`：输入框顶部黄色提示条（design doc §7），流式中止滚动跟随
- 应答后卡片固化为历史（显示用户所选，不可重复操作）

## 6. 架构红线合规自查

- ✅ **PTY 直通**：聊天通道是独立子进程 stdio，PTY 通道一行不改；对 CLI 的 API 请求零拦截（CLI 直连自己的 API）
- ✅ **Token 统计**：仍读 CLI 本地 JSONL 数据文件（cost 模块不变）；result 事件的 usage 仅作聊天内即时展示
- ✅ **凭据**：与 PTY 通道同源——keyring 读取后经环境变量注入子进程，不落盘、不进 IPC 通道明文
- ✅ **axum / 远程**：不新增监听；agent 事件经现有 Bridge 抽象，web-remote 走已有 WS 鉴权链路
- ✅ **本地优先**：无云端服务端依赖

## 7. 验收标准（一阶段）

- [ ] Claude 会话可建为聊天视图：发送消息 → 流式渲染回复（打字机 + 自动跟随 + 上滚暂停）
- [ ] 触发工具执行（如要求它改文件）→ 权限卡片弹出 → 点允许/拒绝 → CLI 按应答继续/停止
- [ ] AskUserQuestion 类交互 → 选项卡片 → 点击应答 → agent 继续
- [ ] 流式中可中断（停止按钮 / Esc），已生成内容保留
- [ ] 会话状态四态（idle/thinking/waiting_input/error）UI 表现符合 design doc §7
- [ ] 同一会话可切换聊天 ⇄ 终端视图；终端视图行为与现有 PTY 完全一致
- [ ] Profile / LLM Provider 凭据注入生效（聊天会话与终端会话同源）
- [ ] 检查链全绿：`cargo clippy -- -D warnings` + `cargo test` + `pnpm exec tsc --noEmit`

## 8. 边界与后续阶段

| 阶段 | 内容 |
| --- | --- |
| 一阶段（本次） | Claude 单家 + 聊天 MVP + 权限/问题卡片 + 视图切换 |
| 二阶段 | CodexDriver（app-server JSON-RPC）/ OpenCodeDriver（HTTP）/ GeminiDriver；工具卡片持久化 |
| 三阶段（design doc V3） | @文件引用、斜杠命令补全面板、图片粘贴、同屏双视图 |
| 不做 | AI 气泡、独立会话列表、语音（design doc §11 边界不变） |

## 9. 风险

1. **协议漂移**：stream-json 控制流为非官方承诺协议，CLI 升级可能破坏 → 版本探测 + 降级提示（切终端模式），Driver 内做版本容错
2. **PoC 失败**：若 control 流实测不可用 → 兜底为 permission-mode 预设（§3.2），聊天体验降级但可用；终端视图永远兜底
3. **usage 口径**：result 事件 usage 与 cost 模块 JSONL 口径可能不一致 → 聊天内仅展示"本次会话即时值"，状态栏权威数字仍走 cost:updated
