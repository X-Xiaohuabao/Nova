# 需求文档 — UI 重构：shadcn/ui + macOS 风格全新骨架

最后更新: 2026-11-03 20:51

## 📋 特性概述

- **特性名称**: UI 重构 — shadcn/ui + macOS 风格全新骨架
- **特性描述**: 弃用 Ant Design，以 shadcn/ui（Radix UI + TailwindCSS 4 + CVA 源码组件）从头搭建 macOS 观感的全新 UI 骨架，旧 UI 备份后按模块重写迁移，业务逻辑资产（stores/utils/hooks/types/ipc 封装）原样复用。
- **特性类型**: 重构
- **涉及端**: 仅前端 UI（`src/`）；**Rust 后端（`src-tauri/`）零改动**

## 已确认的关键决策（用户拍板，2026-11-03）

| # | 决策点 | 结论 |
| --- | --- | --- |
| 1 | 重构方式 | **从头搭建新 UI 骨架**，旧 UI 备份后按需重写迁移；不做逐组件渐进替换 |
| 2 | 备份方式 | **git 分支 `backup/antd-ui`**（可随时切回旧版对照），不物理复制目录 |
| 3 | 旧主题（13 套） | **不保留**，仅实现 macOS 深/浅/跟随系统；IDE 风格主题后续按需再迁移 |
| 4 | 窗口控制按钮 | Windows/Linux/macOS **统一 macOS 交通灯**样式 |
| 5 | 主题范围 | UI 走 macOS 中性明暗色（深/浅/跟随系统）；终端配色（TERMINAL_COLOR_THEMES）不受影响 |
| 6 | 重构组织方式 | **功能点盘点先行**（不按代码目录、按功能点重构，部分功能点可能替换方案）；**骨架优先确定** |
| 7 | 智能体接入演进（方向确认） | 未来从"嵌入智能体终端"演进为"统一聊天 UI → 按工厂模式转发到各 CLI"（**独立立项**，见第 5 节）；本次重构仅在骨架中预留接口位 |
| 8 | 节奏 | 立项（需求 + 台账）完成后暂停，**编码自 2026-11-03 23:00 后开始** |

## 1. 功能需求

### 1.1 Rust 后端（src-tauri/）

**无后端需求。** 本次重构不新增/修改任何 IPC 命令、事件、SQLite 表与迁移。

### 1.2 前端（src/）

#### REQ-100: 功能点盘点清单
- **优先级**: 高
- **描述**: 以现有功能为最小单元盘点全部功能点（会话管理、多工具支持、Profile/供应商、费用统计、终端交互、分屏、搜索、快捷键、引导、数据管理等），产出 `doc/功能点清单.md`，逐项标注处置方式：**保留 / 换方案 / 砍掉 / 待定**；后续迁移任务以该清单为准组织，而非按代码目录。
- **涉及组件**: 文档（doc/功能点清单.md），不碰代码
- **状态管理**: 无
- **依赖**: 无
- **验收标准**: 清单覆盖 src/ 全部用户可见功能点且每项有处置标注；"换方案"项附一句理由（如"智能体嵌入终端 → 统一聊天接入，另立特性"）。

#### REQ-101: 技术栈与规范文档修订
- **优先级**: 高
- **描述**: 将 AGENTS.md / CLAUDE.md 技术栈表中「Ant Design 6.x」替换为「shadcn/ui（Radix UI + TailwindCSS 4）」；两份指导文件保持同步。**规范先行**：编写 `.zcode/skills/shadcn-ui` skill（macOS token 约定、组件引入与定制规范、cn 用法、目录约定、禁用规则），并更新 `tauri-ipc` skill 补充聊天视图/agent 接口位的 IPC 预留约定（`agent:*` 事件命名段保留声明）。
- **涉及组件**: 文档（AGENTS.md / CLAUDE.md / .zcode/skills/shadcn-ui、tauri-ipc）
- **状态管理**: 无
- **依赖**: 无
- **验收标准**: AGENTS.md 与 CLAUDE.md 技术栈表一致且不再出现「AntD 强制」表述；shadcn-ui skill 存在且被 dev 链路引用；tauri-ipc skill 含 agent:* 事件命名预留；旧 antd-ui skill 移除或标记废弃。

#### REQ-102: 旧 UI 备份
- **优先级**: 高
- **描述**: 在开始替换前创建 git 分支 `backup/antd-ui` 备份当前 UI 全量代码（可随时 `git checkout backup/antd-ui` 切回旧版对照），并在台账记录恢复方法。
- **涉及组件**: git（不物理复制目录，仓库历史即备份）
- **状态管理**: 无
- **依赖**: 无
- **验收标准**: `git branch` 中存在 `backup/antd-ui`，指向重构前最后一个可编译提交；master 上后续提交不影响该分支。

#### REQ-103: shadcn/ui 基建
- **优先级**: 高
- **描述**: 安装 shadcn/ui CLI 与运行时依赖（radix-ui、class-variance-authority、clsx、tailwind-merge、lucide-react、sonner、tw-animate-css）；配置 tsconfig `@/` 路径别名与 vite resolve；初始化 `components.json`；落地 `src/lib/utils.ts`（cn 工具）；新增依赖逐项说明理由（符合 AGENTS.md 要求）。
- **涉及组件**: 根配置（tsconfig/vite/components.json）、src/lib/
- **状态管理**: 无
- **依赖**: REQ-101
- **验收标准**: `pnpm exec shadcn add button` 能成功生成组件；`pnpm exec tsc --noEmit` 通过。

#### REQ-104: macOS 主题系统（语义 CSS 变量）
- **优先级**: 高
- **描述**: 以语义 CSS 变量（`--background`/`--foreground`/`--primary`/`--muted`/`--border`…）定义 macOS 风格明暗双套 token，Tailwind 4 `@theme` 映射；支持「深色/浅色/跟随系统」三态切换（复用现有系统主题探测逻辑）；新的 `ThemeProvider`/store 替代原 `src/themes/index.ts` 的 AntD token 体系；终端配色主题（TERMINAL_COLOR_THEMES）保持不变。
- **涉及组件**: src/styles/（token 层）、src/stores/、src/themes/（重写）
- **状态管理**: 修改 appStore 中主题相关字段（key 收敛为 dark/light/system）
- **依赖**: REQ-103
- **验收标准**: 三态切换即时生效且持久化；`pnpm dev` 下切换无闪跳；旧 13 套 UI 主题不再出现在设置项中。

#### REQ-105: shadcn 基础组件库落地
- **优先级**: 高
- **描述**: 按迁移所需引入并按 macOS 观感定制基础组件到 `src/components/ui/`：button、input、select、switch、dialog、tooltip、dropdown-menu、checkbox、slider、tabs、badge、separator、scroll-area、popover、alert-dialog、command（cmdk）、sonner（toast）、form（react-hook-form 集成）等；统一 8px 控件圆角、细分隔线、SF 字体栈、紧凑密度。
- **涉及组件**: src/components/ui/
- **状态管理**: 无
- **依赖**: REQ-104
- **验收标准**: 所列组件均有可运行 demo（或被后续任务实际引用）；`tsc --noEmit` 通过；组件观感符合 macOS 风格基准（圆角/间距/字号一致）。

#### REQ-106: 新 App Shell 骨架（含聊天接口位预留）
- **优先级**: 高（**骨架优先确定**，为全部后续任务的地基）
- **描述**: 全新实现布局骨架：AppLayout / AppHeader / AppSidebar（含折叠、宽度拖拽）/ AppContent / AppStatusBar / WindowControls（三平台统一交通灯）；Header 与侧栏采用毛玻璃质感（backdrop-blur + 半透明）；保留侧栏折叠按钮与项目树交互入口。**为智能体统一接入（独立特性）预留接口位**：会话内容区支持"聊天视图容器"占位（空组件 + 挂载点约定），types 中预留 `agent:*` 事件与 `AgentKind` 相关类型占位，不实现转发逻辑。
- **涉及组件**: src/components/layout/（新实现替换旧文件）、src/components/chat/（仅占位）、src/types/
- **状态管理**: 复用 appStore（sidebarCollapsed、sidebarWidth 等），不新增 store
- **依赖**: REQ-105
- **验收标准**: 新骨架独立可渲染：侧栏折叠/展开、宽度拖拽、交通灯三键（最小化/最大化/关闭）在 Windows 上真实生效；窗口圆角与透明背景保持；聊天占位容器可在会话内容区挂载（渲染空态即可）。

#### REQ-107: TabBar 与 Panes 重做
- **优先级**: 高
- **描述**: macOS 风格重做标签栏（拖拽排序、关闭按钮、新建入口、溢出滚动）与分屏容器（PaneSplitter/PaneView 外壳），对接现有 appStore 会话/标签状态。
- **涉及组件**: src/components/tabs/（TabBar）、src/components/panes/
- **状态管理**: 复用 appStore，不新增 store
- **依赖**: REQ-106
- **验收标准**: 多标签新建/切换/关闭/拖拽排序可用；分屏拖拽分割条可用；`tsc --noEmit` 通过。

#### REQ-108: Settings 全模块迁移
- **优先级**: 高
- **描述**: 设置中心（SettingsPage 导航 + settings/ 下约 20 个页面）全部以新组件库重写：General/Terminal/Claude/Codex/Gemini/OpenCode/Antigravity/CliShell/Keybindings/Network/Notification/DataManagement/McpAccess/RemoteAccess/Sync/LlmProviders/ProfileManagement/AIAssistant/About 等；SettingsSearchBar/SettingRow/SectionHeader 等内部件同步重做；LlmProvider 表单改用 react-hook-form + zod。
- **涉及组件**: src/components/settings/
- **状态管理**: 复用现有 store 字段，不改字段语义
- **依赖**: REQ-106
- **验收标准**: 全部设置页可打开且读写设置项真实生效（改一项→重开仍在）；搜索可定位设置项；`tsc --noEmit` 通过。

#### REQ-109: 表单类弹窗迁移
- **优先级**: 高
- **描述**: profile/（ProfileFormModal、ProfileManager）、project/（NewProjectModal、NewCategoryModal、ProjectNode 交互菜单）、tabs/（NewSessionModal、EditSessionModal、SearchPanel）以 Dialog + react-hook-form + zod 重写；校验规则与原 AntD Form 对齐；凭据字段沿用现有 IPC，不落明文。
- **涉及组件**: src/components/profile/、src/components/project/、src/components/tabs/
- **状态管理**: 复用现有 store 动作
- **依赖**: REQ-105、REQ-106
- **验收标准**: 新建/编辑项目、分类、会话、Profile 全链路可用且校验生效；保存后数据落库正确（手测）。

#### REQ-110: 其余视图迁移
- **优先级**: 中
- **描述**: 迁移剩余视图与外围组件：cost/（CostDashboard、PricingConfigPanel）、help/（HelpModal）、onboarding/（OnboardingFlow、协议与引导）、terminal/（FileTransferPanel、SshConnectionModal；TerminalView 的 xterm 核心不动，仅外壳）、transcript/（TranscriptPanel/MarkdownBody 外壳）、quick-commands/、cli/（CliArgs* 表单件）。
- **涉及组件**: src/components/cost/、help/、onboarding/、terminal/、transcript/、quick-commands/、cli/
- **状态管理**: 复用现有
- **依赖**: REQ-105、REQ-106
- **验收标准**: 上述面板均可打开并完成核心操作（费用面板出数、帮助文档可浏览、引导可完成、SSH 连接表单可提交）；`tsc --noEmit` 通过。

#### REQ-111: 命令式 API 与消息通知替换
- **优先级**: 中
- **描述**: 28 处 `App.useApp()` 的 message 调用替换为 sonner toast（统一成功/失败样式）；Popconfirm 替换为 AlertDialog 确认模式；清除全部 antd message/notification 引用。
- **涉及组件**: 全局（迁移后的各模块）
- **状态管理**: 无
- **依赖**: REQ-108、REQ-109、REQ-110
- **验收标准**: `grep -r "useApp" src/` 零命中；关键操作（删除项目、切换 Profile）均有 toast 或确认框反馈。

#### REQ-112: 拆除 AntD 与收尾验证
- **优先级**: 高
- **描述**: 卸载 `antd`、`@ant-design/icons` 依赖；删除 ConfigProvider/zhCN 挂载、旧 `src/themes/index.ts` UI 主题、`--ant-*` 引用残留；`src/test-*-main.tsx` 测试入口同步更新或移除；执行全链检查并更新 README/项目状态文档。
- **涉及组件**: 全局清理
- **状态管理**: 无
- **依赖**: REQ-111
- **验收标准**: `grep -ri "antd" src/ package.json` 零业务命中；`pnpm exec tsc --noEmit`、`cargo clippy -- -D warnings`、`cargo test` 全部通过；`pnpm build` 成功；核心手测清单（建会话→终端交互→费用面板→设置修改→重启恢复）通过。

## 2. 非功能需求

### 2.1 架构红线核对

- [x] 不拦截/代理 PTY 或 API 请求（纯 UI 层重构，PTY 链路零改动）
- [x] 凭据不落明文（表单迁移时凭据字段仍走原 IPC/Keychain，日志与导出逻辑不动）
- [x] axum 仅监听 127.0.0.1（不涉及）
- [x] 不引入云端服务端依赖（shadcn/ui 为本地源码组件，无服务端）
- [x] 跨平台（交通灯按钮三平台统一实现；字体栈含 PingFang/雅黑/Noto fallback）

### 2.2 性能要求

- 首屏加载耗时不劣于重构前（AntD 全量引入移除后应更优）
- xterm 终端渲染帧率不受影响（终端区不包额外重渲染层）
- 主题切换 < 100ms 且无白屏闪跳

### 2.3 兼容性

- SQLite / JSONL / Profile / 会话数据结构**零变更**，老用户数据直接可用
- IPC 命令与事件命名**零变更**
- 设置项存储 key 尽量沿用，仅主题 key 由旧主题 key 集合收敛为 `dark/light/system`（旧值按明暗归一映射）

## 3. 技术方案

- **方案概述**: shadcn/ui 是"源码分发"组件集合（Radix UI 原语 + Tailwind 4 + CVA），组件代码直接进仓库、可自由定制为 macOS 观感。策略为**备份 → 全新骨架 → 按模块重写迁移 → 拆除 AntD**；逻辑资产（stores/utils/hooks/types/ipc 封装）原样复用，迁移仅发生在视图层。
- **数据结构变更**: 无（含 SQLite 迁移：无）
- **新增依赖及理由**: `radix-ui`（无障碍交互原语，shadcn 运行时基础）、`class-variance-authority` + `clsx` + `tailwind-merge`（cn 工具链，组件变体管理）、`lucide-react`（图标，平替 @ant-design/icons）、`sonner`（toast，平替 message）、`react-hook-form` + `zod`（表单与校验，平替 AntD Form）、`tw-animate-css`（shadcn 动效预设）、`cmdk`（命令面板/自动完成，随 shadcn command 引入）
- **风险与权衡**: 迁移期间应用功能不完整（骨架先立、功能逐模块恢复），单人开发节奏下可接受；AntD Form 校验改造成本集中在 3 个大弹窗（New/EditSessionModal、ProfileFormModal），用 zod schema 显式化规则对冲；无前端单测兜底，迁移每步以 `tsc --noEmit` + 手测核心链路把关。

## 4. 边界（明确不做什么）

- **不迁移** 13 套旧 UI 主题（IDE 风格主题后续按需另立特性）
- **不改** Rust 后端、IPC 接口、SQLite schema、PTY/费用统计等核心逻辑
- **不重写** stores / utils / hooks / types 业务逻辑（原样复用）
- **不做** 国际化、新增功能、UI 布局之外的交互重设计（保持既有信息架构）
- **不动** 终端配色主题（TERMINAL_COLOR_THEMES）与 xterm 核心渲染
- **不实现** 智能体统一接入的转发逻辑（AgentBackend 工厂、聊天转发、CLI headless 适配）——独立立项，本次仅预留接口位

## 5. 智能体统一接入（独立立项预告，本期仅预留）

**方向**（用户确认）：从"直接嵌入智能体终端（xterm + PTY）"演进为"统一聊天对话 UI（Tauri + shadcn/ui）→ 按工厂模式转发到对应智能体 CLI"。

**关键辨析**：转发的是用户消息（经 CLI 官方 headless 接口，stdin/stdout 管道），CLI 的 HTTP API 请求仍由 CLI 自身发出——**「零额外 Token 开销」原则可保住**；AGENTS.md 中「PTY 直通」红线的文字表述将在该特性立项时改写（形如"禁止拦截/代理/修改 CLI 的 HTTP API 请求；智能体交互走 CLI 官方 headless 接口转发"）。

**工厂模式落点**（与现有 CostProvider trait 同构）：

```
前端聊天 UI (shadcn/ui) ⇄ IPC 事件流 (agent:message / agent:state)
        ⇅
Rust AgentBackend trait（工厂按 CLI 类型实例化适配器）
   ├─ ClaudeAdapter   (-p --input/output-format stream-json，双向流式)
   ├─ CodexAdapter    (codex exec / proto)
   ├─ GeminiAdapter   (headless 模式)
   └─ OpenCodeAdapter (opencode run)
```

**已确认**: 聊天优先 + 终端保留（裸终端/SSH 会话仍用 TerminalView，作为高级模式）；独立立项，完成各 CLI headless 能力调研后另走 /kickoff。**聊天界面 UI 设计规范已定义**：`doc/design-agent-chat.md`（ChatGPT/DeepSeek 风格非对称消息形态、流式渲染、工具调用折叠卡片、分期 MVP/V2/V3），立项时直接引用。

**本期预留**（见 REQ-106）: 聊天视图容器占位、`agent:*` IPC 事件命名段声明、`AgentKind` 类型占位。
