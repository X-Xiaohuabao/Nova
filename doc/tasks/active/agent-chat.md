# 智能体统一聊天接入（一阶段：Claude 通道 + 聊天 MVP）

- 来源: /kickoff（需求文档: doc/requirements-agent-chat.md；UI 规范: doc/design-agent-chat.md）
- 创建: 2026-11-04
- 状态: 进行中

## 任务清单

- [x] T1 Rust agent 模块骨架：AgentDriver trait + AgentEvent 统一事件模型 + ClaudeDriver（spawn `claude -p --input-format stream-json --output-format stream-json` 双向子进程、NDJSON 按行读写、映射并 emit `agent:message`/`agent:state`）（2026-11-04 完成，提交 e9e7c45；clippy -D warnings 与 cargo test 220 通过（agent 新增 9 测：system/assistant/tool_use/tool_result/result 用量/stream_event delta/control_request/容错/user 组装）；手动冒烟移至 T2——IPC 命令层接线后才能从前端触发）
  - 验收: cargo clippy -D warnings / cargo test 通过；NDJSON→AgentEvent 解析有单元测试（喂样例行断言事件，含 system/assistant/result/stream_event 四类）；`pnpm tauri dev` 手动冒烟能收到 system init 事件
  - 涉及: src-tauri/src/agent/（mod.rs / claude.rs，新增）、src-tauri/src/lib.rs（模块注册）
- [x] T2 IPC 命令层 + 环境注入复用：`agent_session_start` / `agent_send` / `agent_interrupt` / `agent_session_stop` 四命令；从 commands/pty.rs 抽出 Profile 隔离 + Keychain 凭据 + LLM Provider 环境组装为共享函数，PTY 与 agent 两通道共用（2026-11-04 完成，提交 39d73e3；环境组装平移至 cli/launch_env.rs，pty.rs 改为调用共享函数（逻辑逐行平移）；clippy/test 220 全绿；PTY 通道手动回归随 T6 整体验收）
  - 验收: clippy/test 通过；共享函数行为与原 pty.rs 逐字段等价（重构后 pty 通道回归无变化）；agent 会话启动时凭据经环境变量注入、不落盘不进 IPC 明文
  - 涉及: src-tauri/src/commands/agent.rs（新增）、src-tauri/src/commands/pty.rs（重构抽取）、环境组装共享模块（新增）、lib.rs（命令注册）
- [x] T3 TS 类型 + invoke 封装 + agentStore：AgentEvent/AgentSessionState 类型与 Rust 对齐；invoke/listen 封装；Zustand store（消息列表 + 流式缓冲 + 状态机）（2026-11-04 完成；tsc 通过；归约与状态机拆为纯导出函数 nextState/applyEventToMessages；前端无测试运行器（项目检查链仅 tsc），TS 单测暂缓——已在 Rust 侧补 event_serialization_contract 序列化契约测试锁住字段名对齐；agent:* 封装暂直连 @tauri-apps/api（与 ipc.ts 现行约定一致），bridge 接线待其迁移时统一走）
  - 验收: pnpm exec tsc --noEmit 通过；状态机转移逻辑纯函数化并有测试；selector 粒度符合 zustand-state 技能规范
  - 涉及: src/types/（新增 agent 类型）、src/utils/ipc.ts（追加封装）、src/stores/agentStore.ts（新增）

## 开发中发现（待办追加）

- [ ] D1 存量问题：utils/ipc.ts `startSession` 发送 `envVars`，但 Rust `start_session` 参数为 `user_env_vars`（JS 应传 `userEnvVars`）——Tauri 2 按参数名精确匹配，疑导致 NewSessionModal 的自定义环境变量被静默丢弃。涉及: src/utils/ipc.ts:33、调用方 NewSessionModal。修复需真机验证 env 注入链路，随 T6 回归一并处理
- [x] T4 ChatView MVP：ChatPlaceholder 替换为真实视图——消息流（用户气泡/AI 全宽非对称）+ 流式打字机渲染 + MarkdownBody 抽为 src/components/markdown/ 共享组件（transcript 同步改引用）+ 输入区（Enter 发送/Shift+Enter 换行/IME 不误发）+ 滚动跟随与上滚暂停 + 空态（2026-11-04 完成，提交 75c2293；tsc 通过；消息入场复用 observance.css 的 placeholder-in 并补 prefers-reduced-motion 守卫；MarkdownBody/markdownHighlight git mv 至 src/components/markdown/，TranscriptPanel 改引用；ChatView 已挂 test-shell 预览台（chat 视图）；真机视觉冒烟待 T6 挂接后一并验证——浏览器 MCP 工具本会话不可用，无法代跑视觉走查）
  - 验收: tsc 通过；渲染与交互符合 design-agent-chat.md §3/§4/§5/§6（MVP 范围）；transcript 面板显示无回归；prefers-reduced-motion 降级生效
  - 涉及: src/components/chat/（ChatView 及子组件）、src/components/markdown/（新共享组件）、src/components/transcript/（改引用）
- [ ] T5 权限/问题卡片链路（PoC 关键验证）：PermissionRequest → 权限确认卡（工具名+参数摘要+[允许][拒绝]）→ control_response 回写；AskUserQuestion 类 → 选项卡+Other 自由输入 → tool_result 回写；waiting_input 状态（黄色提示条）→ 应答后卡片固化
  - 验收: 真机跑通——让 Claude 改文件触发权限卡，允许/拒绝行为正确；提问卡应答后 agent 继续；control 流不可用时降级 --permission-mode 预设并在 UI 明示
  - 涉及: src-tauri/src/agent/claude.rs（control 流收发）、src/components/chat/（两类卡片组件）、agentStore（waiting_input 转移）
- [ ] T6 视图切换 + 会话挂接：会话内右上角聊天⇄终端切换控件（聊天默认）；新建智能体会话默认进聊天视图；流式中停止按钮/Esc 中断（保留已生成内容+尾部[继续]）
  - 验收: 同一会话两视图切换正常且终端视图行为与现状零差异；中断后 agent 停止且内容保留；tab 持久化/恢复路径含视图类型
  - 涉及: src/components/chat/（视图壳）、src/stores/appStore.ts（会话视图类型字段）、src/components/panes/（挂载分支）
