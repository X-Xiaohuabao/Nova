# 需求文档 — 国际化（i18n）：中文与英文

最后更新: 2026-11-03 23:30

## 📋 特性概述

- **特性名称**: 国际化 — 中文（zh-CN）与英文（en-US）
- **特性描述**: 引入 react-i18next 作为全项目文案通道，先覆盖中文与英文；默认跟随系统语言（缺省 zh-CN），用户可显式切换并持久化；新骨架组件立即接入，后续所有迁移组件一律走 i18n 通道、禁止硬编码文案。
- **特性类型**: 新功能开发（横切基建）
- **涉及端**: 仅前端 UI（Rust 后端错误信息暂不做 i18n，另行评估）

## 已确认决策

| # | 决策点 | 结论 |
| --- | --- | --- |
| 1 | 语言范围 | 先 zh-CN + en-US 两种，结构预留扩展 |
| 2 | 默认语言 | 跟随系统（navigator.language，zh* → zh-CN，其余 → en-US） |
| 3 | 持久化 | localStorage（`teacoder_language`），与现有侧栏折叠状态同款惯例；设置页迁移时统一 |
| 4 | 技术选型 | `react-i18next` + `i18next`（React 生态事实标准：语言检测、回退链、命名空间、TS 类型提示齐全；shadcn/Tailwind 无冲突） |
| 5 | 范围节奏 | 新骨架（shell/chat）立即接入；旧 AntD UI 不回头改造（迁移重写时直接走 t()）；语言设置项随设置页迁移（T9/T10）落地 |

## 1. 功能需求

#### REQ-I01: i18n 基建
- **优先级**: 高
- **描述**: 安装 `i18next` + `react-i18next`；`src/i18n/` 初始化（资源按命名空间组织：common/shell/chat，语言文件 `locales/zh-CN.json` / `locales/en-US.json`）；初始化顺序：localStorage 显式值 → navigator.language 检测 → 缺省 zh-CN；回退语言 zh-CN；挂载于 `src/main.tsx` 与预览入口；`document.documentElement.lang` 随语言同步。
- **涉及组件**: src/i18n/、src/main.tsx、shell-test.html 入口
- **依赖**: 无
- **验收标准**: 切换语言即时生效；刷新后保持；`tsc --noEmit` 通过。

#### REQ-I02: 骨架组件文案接入
- **优先级**: 高
- **描述**: shell 骨架全部用户可见文案与 aria-label 改走 `useTranslation()`：TitleBar（aria）、TrafficLights（aria）、SidebarShell（搜索/项目/收藏/新建会话）、StatusBarShell（就绪/桥类型标签）、WindowFrame 占位、ChatPlaceholder。
- **涉及组件**: src/components/shell/、src/components/chat/
- **依赖**: REQ-I01
- **验收标准**: grep 骨架组件无硬编码中文（aria 与文案全走 t()）；中英切换即时生效。

#### REQ-I03: 语言设置项（随设置页迁移）
- **优先级**: 中
- **描述**: GeneralSettingsPage（T9 迁移后）新增语言选择：跟随系统 / 简体中文 / English；切换即时生效并持久化。
- **依赖**: REQ-I01、UI 重构 T9
- **验收标准**: 三态可选，重启保持。

#### REQ-I04: 迁移规则固化（规范）
- **优先级**: 高
- **描述**: react-frontend / shadcn-ui skill 增补规则：新增/迁移组件**禁止硬编码用户可见文案**（含 aria-label），一律 `t()` + 资源键；资源键按命名空间组织；文案评审进入迁移验收项。
- **依赖**: REQ-I01
- **验收标准**: 两个 skill 均含该规则；T9~T13 迁移验收引用。

## 2. 非功能需求

- 架构红线：不涉及（纯前端资源层，无网络/凭据/PTY 交互）
- 性能：语言切换 < 50ms（资源同步打包，按需懒加载不做——两语言包体积极小）
- 兼容性：旧 UI（AntD）暂不受影响，其 locale 随迁移移除

## 3. 技术方案

- **方案概述**: i18next 单实例 + React useContext（react-i18next `useTranslation`）；资源 JSON 同步 import；检测链 localStorage → navigator → 默认；回退 zh-CN。
- **数据结构变更**: 无（localStorage 键 `teacoder_language`）
- **新增依赖及理由**: `i18next`（核心，检测/回退/插值）、`react-i18next`（Hooks 绑定）——两者是唯一被广泛维护的组合，其余方案（自建 context）失去 TS 键校验与生态插件
- **风险与权衡**: 单文件资源随功能增长会变大——按命名空间拆分键组，必要时升级为按文件懒加载（结构已预留）

## 4. 边界（明确不做什么）

- 不做第二阶段语言（日/韩等，结构预留即可）
- 不做 Rust 侧错误信息 i18n（后端错误暂直接展示，后续评估）
- 不回头改造旧 AntD UI 的文案（迁移重写时处理）
- 不做服务端语言协商（桌面应用无此场景）
