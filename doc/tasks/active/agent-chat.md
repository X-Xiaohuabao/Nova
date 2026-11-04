# 智能体统一聊天接入（一阶段：Claude 通道 + 聊天 MVP）

- 来源: /kickoff（需求文档: doc/requirements-agent-chat.md；UI 规范: doc/design-agent-chat.md）
- 创建: 2026-11-04
- 状态: 代码完成（V1 真机验证待收口）

## 任务清单

- [x] T1 Rust agent 模块骨架：AgentDriver trait + AgentEvent 统一事件模型 + ClaudeDriver（spawn `claude -p --input-format stream-json --output-format stream-json` 双向子进程、NDJSON 按行读写、映射并 emit `agent:message`/`agent:state`）（2026-11-04 完成，提交 e9e7c45；clippy -D warnings 与 cargo test 220 通过（agent 新增 9 测：system/assistant/tool_use/tool_result/result 用量/stream_event delta/control_request/容错/user 组装）；手动冒烟移至 T2——IPC 命令层接线后才能从前端触发）
  - 验收: cargo clippy -D warnings / cargo test 通过；NDJSON→AgentEvent 解析有单元测试（喂样例行断言事件，含 system/assistant/result/stream_event 四类）；`pnpm tauri dev` 手动冒烟能收到 system init 事件
  - 涉及: src-tauri/src/agent/（mod.rs / claude.rs，新增）、src-tauri/src/lib.rs（模块注册）
- [x] T2 IPC 命令层 + 环境注入复用：`agent_session_start` / `agent_send` / `agent_interrupt` / `agent_session_stop` 四命令；从 commands/pty.rs 抽出 Profile 隔离 + Keychain 凭据 + LLM Provider 环境组装为共享函数，PTY 与 agent 两通道共用（2026-11-04 完成，提交 39d73e3；环境组装平移至 cli/launch_env.rs，pty.rs 改为调用共享函数（逻辑逐行平移）；clippy/test 220 全绿；PTY 通道手动回归随 T6 整体验收）
  - 验收: clippy/test 通过；共享函数行为与原 pty.rs 逐字段等价（重构后 pty 通道回归无变化）；agent 会话启动时凭据经环境变量注入、不落盘不进 IPC 明文
  - 涉及: src-tauri/src/commands/agent.rs（新增）、src-tauri/src/commands/pty.rs（重构抽取）、环境组装共享模块（新增）、lib.rs（命令注册）
- [x] T3 TS 类型 + invoke 封装 + agentStore：AgentEvent/AgentSessionState 类型与 Rust 对齐；invoke/listen 封装；Zustand store（消息列表 + 流式缓冲 + 状态机）（2026-11-04 完成，提交 6e41217；tsc 通过；归约与状态机拆为纯导出函数 nextState/applyEventToMessages；前端无测试运行器（项目检查链仅 tsc），TS 单测暂缓——已在 Rust 侧补 event_serialization_contract 序列化契约测试锁住字段名对齐；agent:* 封装暂直连 @tauri-apps/api（与 ipc.ts 现行约定一致），bridge 接线待其迁移时统一走）
  - 验收: pnpm exec tsc --noEmit 通过；状态机转移逻辑纯函数化并有测试；selector 粒度符合 zustand-state 技能规范
  - 涉及: src/types/（新增 agent 类型）、src/utils/ipc.ts（追加封装）、src/stores/agentStore.ts（新增）

## 开发中发现（待办追加）

- [x] D1 存量问题（2026-11-04 修复，随 T6 提交 f1b1037；封装层参数改 userEnvVars + appStore 三处调用点同步改名；env 注入真机效果随 V1 一并验证）
- [x] T4 ChatView MVP：ChatPlaceholder 替换为真实视图——消息流（用户气泡/AI 全宽非对称）+ 流式打字机渲染 + MarkdownBody 抽为 src/components/markdown/ 共享组件（transcript 同步改引用）+ 输入区（Enter 发送/Shift+Enter 换行/IME 不误发）+ 滚动跟随与上滚暂停 + 空态（2026-11-04 完成，提交 75c2293；tsc 通过；消息入场复用 observance.css 的 placeholder-in 并补 prefers-reduced-motion 守卫；MarkdownBody/markdownHighlight git mv 至 src/components/markdown/，TranscriptPanel 改引用；ChatView 已挂 test-shell 预览台（chat 视图）；真机视觉冒烟待 T6 挂接后一并验证——浏览器 MCP 工具本会话不可用，无法代跑视觉走查）
  - 验收: tsc 通过；渲染与交互符合 design-agent-chat.md §3/§4/§5/§6（MVP 范围）；transcript 面板显示无回归；prefers-reduced-motion 降级生效
  - 涉及: src/components/chat/（ChatView 及子组件）、src/components/markdown/（新共享组件）、src/components/transcript/（改引用）
- [x] T5 权限/问题卡片链路（PoC 关键验证）（2026-11-04 代码完成，提交 c6f81ad；QuestionRequest 事件归一+control_response 应答+tool_result 回写，Rust 14 测全绿；真机 E2E（改文件触发权限卡/提问卡应答续跑）待 V1）：PermissionRequest → 权限确认卡（工具名+参数摘要+[允许][拒绝]）→ control_response 回写；AskUserQuestion 类 → 选项卡+Other 自由输入 → tool_result 回写；waiting_input 状态（黄色提示条）→ 应答后卡片固化
  - 验收: 真机跑通——让 Claude 改文件触发权限卡，允许/拒绝行为正确；提问卡应答后 agent 继续；control 流不可用时降级 --permission-mode 预设并在 UI 明示
  - 涉及: src-tauri/src/agent/claude.rs（control 流收发）、src/components/chat/（两类卡片组件）、agentStore（waiting_input 转移）
- [x] T6 视图切换 + 会话挂接（2026-11-04 代码完成，提交 f1b1037；claude 默认聊天视图、右上角切换控件、通道切换停旧起新保消息、closeTab/deleteSession 联动 agent 停止、sessionViewModes localStorage 持久化、附带修复 D1（startSession envVars→userEnvVars 参数名，三处调用点同步）；同会话切终端视图行为与现状一致需真机复核（V1））：会话内右上角聊天⇄终端切换控件（聊天默认）；新建智能体会话默认进聊天视图；流式中停止按钮/Esc 中断（保留已生成内容+尾部[继续]）
  - 验收: 同一会话两视图切换正常且终端视图行为与现状零差异；中断后 agent 停止且内容保留；tab 持久化/恢复路径含视图类型
  - 涉及: src/components/chat/（视图壳）、src/stores/appStore.ts（会话视图类型字段）、src/components/panes/（挂载分支）

- [x] V1-1 Windows 死链修复（2026-11-04，真机截图反馈驱动）：claude .cmd shim 无法被 tokio 直接 spawn → 经 cmd /C 包装；workDir "~" Windows 非法路径 → 展开 HOME；stop 单杀 cmd 留僵尸 node → taskkill /T /F 整树终止
- [x] V1-2 启动失败可见化：agentStore.start 失败置 error 态 + 错误卡片入流（此前静默吞错，UI 卡"启动中"红按钮）；startAgentChannel 统一上报不外抛
- [x] V1-3 视觉打磨：思考中/连接中三点脉冲占位（design doc §7 thinking 态补齐，含 reduced-motion 降级）；失败用户气泡补 [发送失败+重试]（design doc §6）

- [ ] V1 真机 E2E 验证（T5/T6 验收的机器侧收口，代码已全绿）
  - 验收: `pnpm tauri dev` 跑通——新建 claude 会话默认进聊天视图；发消息流式渲染；让 Claude 改文件触发权限卡（允许/拒绝行为正确）；提问卡应答后 agent 继续；停止按钮/Esc 中断且内容保留；聊天⇄终端切换正常且终端视图与现状零差异；重启后视图偏好保持；PTY 通道回归（codex/gemini/opencode/terminal/ssh 建会话正常）
  - 涉及: 全链路
- [ ] V2（design doc §10）：工具调用折叠卡片完整态、复制/重新生成工具条、日期分隔线、错误重试按钮、thinking/waiting_input 完整视觉
- [ ] V3（design doc §10）：@文件引用、斜杠命令面板、图片粘贴、同屏双视图
