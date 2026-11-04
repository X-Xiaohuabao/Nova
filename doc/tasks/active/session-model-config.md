# 会话/项目/全局三层模型配置 + 交互重构

- 来源: 用户目标(三层模型配置)+ 全仓摸底分析
- 创建: 2026-11-04
- 状态: 进行中
- 方案真相源: `doc/design-session-model-config.md`

## 任务清单

### M1 数据层

- [x] 迁移 v17:projects 表新增 default_tool_type / default_llm_provider_id / default_model_name / default_claude_models(2026-11-04 完成;⚠️ 台账原记 v16,实际 v16 已被 transfer_log 占用顺延为 v17;default_llm_provider_id 为 TEXT(uuid)而非设计初稿的 INTEGER,以现有 llm_providers.id 类型为准;迁移器目录扫描自动发现,schema_version 幂等)
  - 验收: 迁移幂等执行;全部 nullable;project_list 返回新字段
  - 涉及: src-tauri/migrations/、src-tauri/src/commands/、src/types/
- [x] 三层解析单一真相源:IPC resolve_session_defaults(project_id),回退链 会话→项目→全局(is_default)→兜底;删除"第一个 Profile 偏好"暗规则(2026-11-04 完成;解析核心 llm_provider/defaults.rs 纯函数 resolve_core + 9 单测锁定回退链(项目全命中/项目工具落全局/全局不兼容落第一兼容/失效供应商下落/全局工具偏好/无兼容工具兜底/首可用工具/claude 5 档构建/默认模型取首);NewSessionModalNext 移除 profileLlmDefaults 状态、pickTool 的 getToolSettings 异步读取与三级回退 effect 链,改为弹窗打开时一次 resolve 采纳(userPickedToolRef 防覆盖用户手选);手动切工具的默认供应商为本地同步推导(全局默认兼容→第一兼容),与后端规则的统一收口留待 M2;检查链 clippy -D warnings / test 242 / tsc 全绿)
  - 验收: NewSessionModalNext 不再有异步猜测默认值的 effect;多项目/多供应商下默认值可预测
  - 涉及: src-tauri/src/llm_provider/、src/components/tabs/next/NewSessionModalNext.tsx

### M2 新建会话交互

- [x] 新建弹窗重构:默认态一行(显示解析结果,一键创建)+ 高级折叠区;智能体→模型级联只列已配置模型;默认项目取当前活动 tab 所属项目(禁 projects[0])(2026-11-04 完成,提交 3daa424;摘要行显示 工具·供应商·模型+来源徽标(未偏离解析结果时显示 项目默认/全局默认/默认);高级折叠区收纳 分类/名称/颜色/思考强度/模板/Claude参数/5档映射/环境变量,SSH 参数保持可见(必填核心);级联沿用 compatibleProviders(仅 active)→provider.models,只列已配置模型;默认项目链收进 appStore.setNewSessionModalOpen(活动会话所属项目→最近活动会话所属项目→首项目),侧栏+与 TabBar+两入口统一受益,AppNext 移除 projects[0] 硬编码;i18n +7 键两语言;tsc 通过,Rust 零改动沿 M1 绿基线;真机视觉/交互验证待用户)
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

- [ ] 项目右键/编辑弹窗:默认智能体+供应商+模型三字段编辑(v17 字段)
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
