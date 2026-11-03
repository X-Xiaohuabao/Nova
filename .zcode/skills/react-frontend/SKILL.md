---
name: react-frontend
description: |
  React 19 + TypeScript 5 前端编码规范。

  触发场景：
  - 编写/修改 src/ 下的 React 组件
  - Props 类型定义、组件拆分
  - 渲染性能、hooks 使用
---

# React 前端规范

## 组件

- 函数组件 + Hooks，**禁止** class 组件
- 组件文件 PascalCase（`SessionList.tsx`），工具文件 camelCase（`formatTime.ts`）
- 组件放 `src/components/<领域>/`；通用组件放 `src/components/common/`

## TypeScript

- 严格模式：`"strict": true`，**禁止**关闭
- Props 必须定义 interface/type，**禁止** `any`（含 `as any`）
- 后端返回数据类型统一放 `src/types/`，与 Rust 结构体对齐

## Hooks

- effects 只做同步副作用，业务逻辑抽到自定义 hook 或 utils
- 事件监听（`listen`）必须在 cleanup 中 `unlisten`
- **禁止**在渲染路径里做昂贵计算（需要则 `useMemo`）

## 状态管理

- 全局状态统一 Zustand（见 zustand-state 技能），**禁止** Context + useReducer 替代全局状态
- 组件私有状态用 `useState`，不逃逸到 store

## 其他

- **禁止** `console.log` 进生产代码；调试用 `console.debug` 并在提交前清理
- **禁止** TODO/FIXME/HACK 注释
- **国际化（强制）**：用户可见文案与 aria-label **禁止硬编码**（含中文/英文），一律 `useTranslation()` + `t()` 走 `src/i18n/` 资源键；键按命名空间组织（common/shell/chat/settings/…），迁移新模块时增补对应键组
- 提交前：`pnpm exec tsc --noEmit` 必须通过
