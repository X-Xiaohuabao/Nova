---
name: antd-ui
description: |
  【已废弃 2026-11-03】Ant Design 已从技术栈移除，UI 组件规范迁移至 shadcn-ui skill。
  本文件仅作迁移期参考保留，禁止在新增代码中按本文件实践。

  触发场景：
  - 仅限：排查遗留 AntD 代码（重构迁移期）
---

# AntD + TailwindCSS 共存规范【已废弃】

> ⚠️ **本规范已于 2026-11-03 废弃**：项目 UI 组件库由 Ant Design 切换为 shadcn/ui，现行规范见 `.zcode/skills/shadcn-ui/SKILL.md`。
> 本文件仅供重构迁移期查阅旧代码时参考，**禁止**在新增代码中按本文件实践。

## 职责划分（强制）

- **AntD 负责**：UI 组件——按钮、表单、弹窗、表格、下拉、Tabs、抽屉等
- **Tailwind 只负责**：布局（flex/grid）、间距（p/m/gap）、自定义样式类
- 🔴 **禁止**用 TailwindCSS 覆盖 AntD 组件的样式（不得对 `.ant-*` 类用 Tailwind 强改）
- Tailwind 配置 `preflight: false`（或 `corePlugins: { preflight: false }`）避免样式重置冲突

## 版本锁定

- AntD 6.x（**禁止**降级 5.x API，如 `visible` → 用 `open`）
- Tailwind 4.x
- React 19 兼容性注意：AntD 6 原生支持，无需 patch

## 组件使用

- 表单用 `Form` + 受控/非受控按 AntD 6 API；弹窗用 `Modal open={...}`
- 表格分页、排序走 AntD 内建，**禁止**自造分页
- 消息/确认用 `App.useApp()`（message/modal/notification），**禁止**静态方法直接调用（React 19 下丢上下文）

## 布局

- 页面骨架：flex/grid 用 Tailwind 类
- 图标统一 `@ant-design/icons`，**禁止**混用多套图标库

## 检查清单

- [ ] 无 Tailwind 覆盖 `.ant-*` 样式
- [ ] 无 `!important` 打补丁（发现即重构）
- [ ] message/modal 走 App.useApp()
