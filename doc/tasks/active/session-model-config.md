# 会话/项目/全局三层模型配置 + 交互重构

- 来源: 用户目标(三层模型配置)+ 全仓摸底分析
- 创建: 2026-11-04
- 状态: 进行中
- 方案真相源: `doc/design-session-model-config.md`

## 任务清单

### M1 数据层

- [ ] 迁移 v16:projects 表新增 default_tool_type / default_llm_provider_id / default_model_name / default_claude_models
  - 验收: 迁移幂等执行;全部 nullable;project_list 返回新字段
  - 涉及: src-tauri/migrations/、src-tauri/src/commands/、src/types/
- [ ] 三层解析单一真相源:IPC resolve_session_defaults(project_id),回退链 会话→项目→全局(is_default)→兜底;删除"第一个 Profile 偏好"暗规则
  - 验收: NewSessionModalNext 不再有异步猜测默认值的 effect;多项目/多供应商下默认值可预测
  - 涉及: src-tauri/src/llm_provider/、src/components/tabs/next/NewSessionModalNext.tsx

### M2 新建会话交互

- [ ] 新建弹窗重构:默认态一行(显示解析结果,一键创建)+ 高级折叠区;智能体→模型级联只列已配置模型;默认项目取当前活动 tab 所属项目(禁 projects[0])
  - 验收: 默认路径 ≤2 次交互完成新建;claude 5 档映射进折叠区
  - 涉及: src/components/tabs/next/NewSessionModalNext.tsx、AppNext.tsx、TabBarNext.tsx

### M3 会话内切换

- [ ] 会话头部/状态栏轻量切换器:dropdown 选智能体/供应商/模型,写回 session 字段
  - 验收: 切换后 session_update 持久化;重进会话沿用;双开时明确提示不生效
  - 涉及: AppNext.tsx、appStore、commands/session.rs
- [ ] 聊天通道 /model 热切换(作为用户输入发送,复用 pendingClaudeRenames 机制);PTY 通道提示"重启后生效"
  - 验收: 聊天会话不重启即可换模型;PTY 会话有明确提示
  - 涉及: agentStore、appStore

### M4 项目默认配置 UI

- [ ] 项目右键/编辑弹窗:默认智能体+供应商+模型三字段编辑(v16 字段)
  - 验收: 设置后该项目新建会话默认值随之变化;清空则回退全局
  - 涉及: SidebarTreeNext.tsx、NewProjectModalNext 或新组件

### M5 结构重构(穿插)

- [ ] 抽 New/Edit 共享 useSessionForm hook,消除 ~150 行复制
- [ ] createSession 拆"创建/启动"两步 + 启动失败回滚
- [ ] appStore 拆域 store + 删死状态(settingsPage/compactMode/fontSize/duplicateSession/locateSession/costTick/manualGuideOpen 等)
- [ ] 统一删除确认组件,替换 4 处重复实现
- [ ] 清理 tool_settings.model 死字段展示;两套默认值来源合一(随 M1 完成)

### 已完成

- [x] 修复 .zcode/config.json 空 matcher 导致 hooks 整体加载失败(2026-11-04;UserPromptSubmit/Stop 的 matcher 为空串触发 ZCode schema 校验失败,强制技能评估自 11-03 迁移起从未生效,删除两处空 matcher 字段)
- [x] 同步 skill-forced-eval.cjs 硬编码技能清单(2026-11-04;移除已废弃 antd-ui,补 shadcn-ui/macos-hig,已端到端验证输出)
