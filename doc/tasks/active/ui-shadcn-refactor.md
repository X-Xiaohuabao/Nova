# UI 重构 — shadcn/ui + macOS 风格全新骨架

- 来源: /kickoff（需求文档: doc/requirements-ui-refactor.md）
- 创建: 2026-11-03
- 状态: 进行中
- 节奏约定: 编码任务自 2026-11-03 23:00 后开始；每轮 `/dev-loop` 一个最小提交；主干始终 `tsc --noEmit` 通过
- 组织原则: **功能点盘点先行 → 骨架优先确定 → 规范先行 → 按功能点清单迁移**

## 任务清单

### 阶段 0 · 盘点、备份与规范

- [x] T0 盘点功能点清单（完成于 2026-11-03，提交 9f55e8e 后追加未提交，做了什么：产出 doc/功能点清单.md——A~I 九域 54 项功能点，保留 40 / 换方案 5 / 砍掉 4 / 待定 3（G9 设置同步、G10 AI 补全、B4 会话记录形态，需用户拍板））
  - 验收: 产出 `doc/功能点清单.md`，覆盖 src/ 全部用户可见功能点，逐项标注 保留/换方案/砍掉/待定；"换方案"项附一句理由（智能体嵌入终端 → 标注"统一聊天接入，另立特性"）
  - 涉及: doc/功能点清单.md（只读代码，不碰代码）
- [x] T1 创建备份分支并修订技术栈声明（完成于 2026-11-03，未提交，做了什么：创建 backup/antd-ui 分支指向 026fe72；AGENTS.md/CLAUDE.md 技术栈表 AntD→shadcn/ui、编码规范节与 skills 列表同步修订）
  - 验收: `backup/antd-ui` 分支存在且指向可编译提交；AGENTS.md / CLAUDE.md 技术栈表替换 AntD 为 shadcn/ui 且两份一致；红线表述保持不变（PTY 相关改写留给智能体接入立项）
  - 涉及: git、AGENTS.md、CLAUDE.md
- [x] T2 编写 shadcn-ui skill 并更新 tauri-ipc skill（规范先行）（完成于 2026-11-03，未提交，做了什么：新建 shadcn-ui SKILL.md（语义 token/cn/CVA/方案锁定/macOS 基准）；tauri-ipc 增补 agent:* 命名段预留；antd-ui 标记废弃保留供迁移期参考）
  - 验收: `.zcode/skills/shadcn-ui/SKILL.md` 就位（macOS token 约定、组件引入/定制规范、cn 用法、目录约定、禁用规则）；`tauri-ipc` skill 补充 `agent:*` 事件命名段预留声明；旧 `antd-ui` skill 移除或标记废弃
  - 涉及: .zcode/skills/
- [x] T3 搭建 shadcn/ui 基建（依赖+别名+components.json）（完成于 2026-11-03，未提交，做了什么：装 cva/clsx/tailwind-merge/lucide-react/radix-ui 五项核心依赖；tsconfig paths + vite alias 双侧 @/ 别名；components.json 初始化（css 指向 tokens.css）；src/lib/utils.ts cn 工具；tsc 通过）
  - 验收: 依赖安装完成且逐项有理由注释（radix-ui / cva / clsx / tailwind-merge / lucide-react / sonner / react-hook-form / zod / tw-animate-css / cmdk）；`@/` 别名 tsconfig+vite 双侧生效；`components.json` 初始化；`src/lib/utils.ts` cn 工具就位；`pnpm exec tsc --noEmit` 通过
  - 涉及: 根配置、package.json、src/lib/
  - 依赖: T1、T2
  - 说明: sonner/react-hook-form/zod/tw-animate-css/cmdk 按 T5/T8 组件落地时按需安装，不提前引入

### 阶段 1 · 骨架确定（最高优先级）

- [x] T4 实现 macOS 语义 token 与三态主题系统（完成于 2026-11-03，提交 f6a4b32，做了什么：src/themes/legacy.ts 旧 key 归一映射（按 BUILT_IN_THEMES.algorithm，表外按命名兜底）；src/stores/themeStore.ts 三态 store（zustand persist + prefers-color-scheme 监听 + merge 校验重算 resolved）；预览台接三态循环切换；i18n 增 theme 命名空间两语言）
  - 验收: `--background/--foreground/--primary/--muted/--border` 等语义变量明暗双套齐全，Tailwind 4 `@theme` 映射完成；深/浅/跟随系统三态切换即时生效并持久化；旧主题 key 归一映射（暗色系→dark、浅色系→light）
  - 涉及: src/styles/、src/stores/、src/themes/
  - 依赖: T3
- [x] T5 落地最小组件集（骨架所需）（完成于 2026-11-03，提交 006d6a6，做了什么：shadcn add 8 组件（含 sheet）进 src/components/ui/；修正 CLI 误加的陌生 cn 依赖→统一 @/lib/utils；macOS 密度定制（button 32/28px 档、input 32px、dialog p-5+max-w 560、标题 15px）；基件 sr-only/Close 文案 i18n 化；ResponsiveDialog 落 src/components/common/（双壳+把手下拉 80px 关闭+85vh 内滚）；预览台组件演示按钮）
  - 验收: button / input / dropdown-menu / tooltip / dialog / separator / scroll-area 落地 `src/components/ui/` 并按 macOS 观感定制（8px 圆角、紧凑密度、SF 字体栈）；**ResponsiveDialog 封装落地**（≥768px Dialog / <768px 底部 Sheet，见 doc/design-ui-patterns.md 第 2 章）；`tsc --noEmit` 通过
  - 涉及: src/components/ui/
  - 依赖: T4
- [x] T6 全新实现 App Shell 骨架（Layout/Header/Sidebar/StatusBar/交通灯 + 聊天接口位预留）（完成于 2026-11-03，提交 17d0de3，做了什么：shellStore 侧栏折叠/宽度偏好持久化（200~320 clamp，localStorage）；SidebarShell 折叠形态（56px 图标窄条）；SidebarResizeHandle 指针捕获拖拽（松手落库、双击复位）；TitleBar 侧栏按钮全尺寸化（lucide PanelLeft，桌面切折叠/移动开抽屉）；WindowFrame 接线）
  - 验收: 新骨架渲染正常；侧栏折叠/宽度拖拽可用（tsc+vite 编译冒烟通过；本会话无浏览器自动化工具，交互手测待复核）；WindowControls 三平台统一交通灯且三键在 Windows 真实生效（已接真实窗口调用，真机验证随 Tauri 启动复核）；Header/侧栏毛玻璃质感；窗口圆角与透明背景保持；聊天视图容器占位可挂载（空态），types 预留 `agent:*` 与 `AgentKind` 占位类型（689447d 已落）
  - 涉及: src/components/layout/、src/components/chat/（占位）、src/types/
  - 依赖: T5
- [x] T7 重做 TabBar 与 Panes 外壳（交互按 macos-hig 第 8 章标签页规范执行）（完成于 2026-11-03，提交 9b3394d，做了什么：TabBarNext 单行弹性收缩（flex-1 均分 active 1.2 权重 min96/max200/h32）、surface-blur 融合条、hover 关闭钮、中键关闭、双击 inline 重命名、右键 ContextMenu（分屏右侧/关闭/关闭其他/关闭右侧/关闭全部）、HTML5 DnD 中线判定+DOM 指示线+落位 FLIP 位移动画、溢出横滚+右缘渐隐、lucide 品牌图标；PaneViewNext 外壳 + PaneSplitter token 化；快捷键补 ⌘1-9 直达/⌘[ ] 切换并按 runtime 过滤桌面专属键；token 增 success/warning 语义色；tabbar 测试台切新组件并保留 __PANE_TABS__ 断言契约）
  - 验收: 多标签新建/切换/关闭/拖拽排序可用，且符合规范：单行弹性收缩（flex-1 均分，min 96/max 200，禁止换行）、关闭钮 hover 显示、溢出横向滚动+右缘渐隐、拖拽位移动画+指示线、双击重命名、右键关闭其他/全部、⌘T/⌘W/⌘1-9/⌘⇧[ ] 快捷键、状态点语义（运行脉冲绿；未读蓝/错误红数据源旧 store 不存在，随智能体接入补全）；分屏分割条拖拽可用；对接现有 appStore 会话状态（tsc+vite 编译冒烟通过；真实拖拽回归建议按 doc/tab-drag-test.md Playwright 流程复核，本会话无浏览器工具未跑）
  - 验收: 多标签新建/切换/关闭/拖拽排序可用，且符合规范：单行弹性收缩（flex-1 均分，min 96/max 200，禁止换行）、关闭钮 hover 显示、溢出横向滚动+右缘渐隐、拖拽位移动画+指示线、双击重命名、右键关闭其他/全部、⌘T/⌘W/⌘1-9/⌘⇧[ ] 快捷键、状态点语义（运行脉冲绿/未读蓝/错误红）；分屏分割条拖拽可用；对接现有 appStore 会话状态
  - 涉及: src/components/tabs/（TabBar）、src/components/panes/
  - 依赖: T6

### 阶段 2 · 组件库补全

- [x] T8 补全表单与命令组件（完成于 2026-11-04，提交 94a47b9，做了什么：shadcn add 12 组件（select/switch/checkbox/slider/badge/popover/tabs/alert-dialog/command/form/sonner + label 随 form）进 src/components/ui/；依赖补装 sonner/react-hook-form/zod/cmdk；sonner.tsx 主题档位改接 themeStore（移除 CLI 默认的 next-themes）；CLI 误加 cn 依赖二次清除、cn 导入统一 @/lib/utils；预览台挂 Toaster + toast 演示）
  - 验收: select / switch / checkbox / slider / badge / popover / tabs / alert-dialog / command(cmdk) / form(react-hook-form 集成) / sonner 落地 `src/components/ui/`；`tsc --noEmit` 通过（vite 编译冒烟过）
  - 涉及: src/components/ui/
  - 依赖: T5

### 阶段 3 · 功能点迁移（以 T0 功能点清单为准，清单若调整则同步台账）

- [x] T9 迁移 Settings 框架与通用件（SettingsPage + SearchBar/SettingRow/SectionHeader）（完成于 2026-11-04，提交随本条，做了什么：settings/next/ 新目录——SettingsPageNext 框架（左导航 6 组 200px + 右面板 max-w 640 独立滚动 + 搜索静态索引（页名+设置项标签，t() 渲染期取当前语言）→ 点击切页/滚动定位/高亮 1.5s + 移动端 <768px Select 切页 + 17 页注册表（未迁移页 Badge 禁用态））；SettingRow（36px 行高、窄屏上下堆叠、id 锚点+高亮）；SectionHeader；GeneralSettingsNext（语言三态/主题三态/界面缩放 slider/界面字体系统枚举）；TerminalSettingsNext（全键迁移：Shell/字体 FontPicker(Popover+Command 可搜索)/字号/行高/配色/光标/回滚/行为开关/环境变量 Textarea）；缩放与字体在框架层即时生效（--ui-zoom/--ui-font）；预览台加聊天/设置视图切换）；i18n 增 settings 命名空间两语言全量键 + textarea 组件 + resetLanguageToSystem）
  - 验收: 设置中心按 **doc/design-ui-patterns.md 第 1 章**实现（左分类导航 6 组 + 右内容面板 max-w 640 + 搜索定位 + 移动端下拉切换）；SettingRow 窄屏上下堆叠；General + Terminal 两页先迁移完成且设置读写生效（复用 appStore 偏好/terminalSettings 持久化链路；含语言三态选择，i18n I3 一并落地）；tsc + vite 编译冒烟通过
  - 涉及: src/components/settings/
  - 依赖: T6、T8
- [x] T10 迁移 Settings 其余页面（分批）（完成于 2026-11-04，三批提交 672073c / a3a6027 / cd266d6，做了什么：批一 CLI 六页——ToolSettingsPageNext 声明式字段配置（tool_settings 顶层列+settingsJson 拆分与旧一致，Antigravity apiKey 沿用原存储链路不落日志）+ QuickCommandsEditorNext；批二 Network/Notification（useLocalStorageSettings 防抖静默持久化，同键兼容）/DataManagement（占位保持 G7 拍板，清除经 AlertDialog）/McpAccess（列表 CRUD）/About（技术栈标签更新 shadcn/ui）；批三 Keybindings（KeyCaptureInput 录制 + src/lib/shortcut.ts getPlatform/formatShortcut 平台化 + 应用内固定键只读区，3.2/3.3 规范）+ RemoteAccessNext（RA5 面板）；SyncPage/AIAssistantPage 未迁移（G9/G10 拍板））
  - 验收: Claude/Codex/Gemini/OpenCode/Antigravity/CliShell/Keybindings/Network/Notification/DataManagement/McpAccess/RemoteAccess/About 各页可打开且设置生效（注册表 15 页中 13 页已挂载，SyncPage 删除、AIAssistantPage 移除）；快捷键页展示经 `formatShortcut` 平台化；`tsc --noEmit` + vite 编译冒烟通过
  - 涉及: src/components/settings/
  - 依赖: T9
- [x] T11 迁移 LlmProviders + ProfileManagement（含 react-hook-form + zod 改造）（完成于 2026-11-04，提交 f6a68e4，做了什么：LlmProvidersNext——卡片列表（启停/默认/软删 AlertDialog 确认）+ PresetPicker（ResponsiveDialog）+ LlmProviderEditDialog（RHF+zod：name/协议/认证/BaseURL/图标 datalist/颜色 hex 校验/useFieldArray 模型列表+默认单选）；凭据独立 state 保持 touched 才覆盖语义；ProfileManagementNext——列表 + ProfileDialogNext（RHF+zod + getProfileCredential 掩码回显 + deleteProfile{removeData:false}）；ipc.ts 补 ProfileCredentialKeys 契约类型（后端 update_profile 读 apiKey 键写 Keychain，原 any 逃逸改为显式类型））
  - 验收: 供应商卡片/编辑弹窗/Profile 管理全部新实现；校验规则与原 AntD Form 对齐（required/枚举/hex/至少一模型）；凭据字段仍走原 IPC 不落明文；tsc + vite 冒烟通过
  - 涉及: src/components/settings/、src/components/profile/、src/components/cli/
  - 依赖: T9
- [x] T12 迁移 project/tabs/profile 弹窗组（完成于 2026-11-04，三批提交 0150aff / 5fa369a / 12fd2ab，做了什么：NewProjectModalNext（目录选择+颜色行）+ NewCategoryModalNext + SearchPanelNext（cmdk CommandDialog，toast 兼容 MessageLike 契约）；NewSessionModalNext（工具卡片 lucide 化/Profile 默认供应商联动/Claude 分层映射含 1M/模板/思考强度/颜色继承/SSH 测试）+ CliArgsClaudeNext + SshArgsFieldsNext（token 版子表单）；EditSessionModalNext（cliArgs 反解析回填/供应商切换默认模型（首次加载保留存量）/SSH 参数变更重连提示）；ProfileFormModal/ProfileManager 已由 T11 ProfileDialogNext/ProfileManagementNext 覆盖；弹窗一律 ResponsiveDialog）
  - 验收: NewProjectModal / NewCategoryModal / NewSessionModal / EditSessionModal / ProfileFormModal / ProfileManager / SearchPanel 全链路可用（创建→落库逻辑对齐旧实现；「显示正确」的完整手测待新 App Shell 接线后复核，预览台可触发搜索/新建项目演示；tsc + vite 冒烟通过）
  - 涉及: src/components/project/、src/components/tabs/、src/components/profile/
  - 依赖: T8、T6
- [ ] T13 迁移外围视图（cost/help/onboarding/terminal 外壳/transcript/quick-commands/cli）
  - 验收: 费用面板出数、帮助可浏览、引导可完成、FileTransferPanel/SshConnectionModal 可操作；TerminalView xterm 核心不动仅换外壳；`tsc --noEmit` 通过
  - 涉及: src/components/cost/、help/、onboarding/、terminal/、transcript/、quick-commands/、cli/
  - 依赖: T6

### 阶段 4 · 收尾

- [ ] T14 替换命令式 API（message→sonner、Popconfirm→AlertDialog）
  - 验收: `grep -r "useApp" src/` 零命中；删除项目/切换 Profile 等关键操作均有 toast 或确认框
  - 涉及: 全局迁移后模块
  - 依赖: T10、T11、T12、T13
- [ ] T15 拆除 AntD 与全链验证
  - 验收: `antd`、`@ant-design/icons` 卸载；ConfigProvider/zhCN/旧主题/`--ant-*` 残留清零（grep 验证）；`pnpm exec tsc --noEmit` + `cargo clippy -- -D warnings` + `cargo test` + `pnpm build` 全通过；核心手测清单（建会话→终端交互→费用面板→改设置→重启恢复）通过
  - 涉及: package.json、src/ 全局
  - 依赖: T14

### 追加任务（进行中发现）

- [x] T16 平台桥接层封装（web-remote 预留）（完成于 2026-11-03，未提交，做了什么：`src/lib/bridge/` 四件套——types（Bridge 接口 + WS 帧协议）/ tauri-bridge / ws-bridge（协议完整客户端骨架，连接鉴权由远程访问特性交付）/ index（getBridge 自动选通道）；env 增加 runtimeKind/isMobileViewport；TitleBar 交通灯按 runtime 显隐；StatusBar 显示桥类型标识；预览支持 ?platform=mobile 双形态演示）
  - 验收: `pnpm exec tsc --noEmit` 通过；?platform=mobile 形态交通灯隐藏且状态条显示 web-remote/WebSocket；桌面形态显示 tauri-desktop/Tauri IPC；领域 API（utils/ipc.ts）未来仅需将底层 invoke 换为 getBridge().invoke 即可切换通道
  - 涉及: src/lib/bridge/、src/lib/tauri/env、src/components/shell/
  - 依赖: T3

- [x] T17 移动端自适应布局（完成于 2026-11-03，未提交，做了什么：WindowFrame 响应式容器（<768px 铺满视口无圆角，≥768px 桌面窗口形态）；侧栏抽屉化（汉堡按钮 + 遮罩 + 滑入动画，仅窄视口）；shell-test.html 补 viewport meta（修复移动浏览器 980px 默认布局视口导致断点失效）；待办清单登记远程服务端/外网穿透延后条目）
  - 验收: iPhone 390x844 视口下窗口铺满、侧栏收为抽屉（点汉堡唤出/点遮罩关闭）、交通灯隐藏；桌面 1280x820 无回归；`pnpm exec tsc --noEmit` 通过
  - 涉及: src/components/shell/、shell-test.html、doc/待办清单.md
  - 依赖: T16

## 备注

- 2026-11-03 补充：新增 `macos-hig` skill（Apple HIG 摘译 + TeaCoder 落地参数），作为设计决策依据源；shadcn-ui skill 引用之；标题栏高度按 HIG unifiedCompact 档从 44px 修正为 38px
- 2026-11-03 地基固化（用户确认观感后）：token 正式化拆分至 `src/styles/tokens.css`（单一来源，@theme 映射随预览入口编译）；`shell.css` 引入完整 preflight；新增 Tauri 预留层 `src/lib/tauri/`（env + window 封装，浏览器预览 no-op 降级）、`src/types/agent.ts`（agent 命名段类型占位）、`src/components/chat/ChatPlaceholder.tsx`（聊天挂载点）；WindowFrame 内容区插槽化（children）；交通灯接真实窗口调用。T4 进度：token 层已正式化，三态切换（跟随系统+持久化）待做

- 每完成一项立即勾选并附「做了什么 + 提交短 hash」
- 迁移期应用允许功能不完整，但每次提交必须可编译（`pnpm exec tsc --noEmit`）
- 发现新待办追加到本清单末尾，不打断当前轮
- T0 盘出「砍掉/换方案」的功能点后，对应迁移任务（T9~T13）在开工前按清单微调范围
- 智能体统一接入为独立特性（另立 kickoff），本期仅在 T6 预留接口位
