---
name: zustand-state
description: |
  Zustand 全局状态管理规范。

  触发场景：
  - 新增/修改 store（src/stores/）
  - 跨组件共享状态
  - 状态持久化、selector 优化
---

# Zustand 状态管理规范

## 基本约定

- 全局状态统一 Zustand，store 文件放 `src/stores/`，命名 `<领域>Store.ts`
- **禁止**用 Context + useReducer 替代全局状态
- 组件私有状态不进 store

## Store 设计

- 一个领域一个 store（sessionStore / profileStore / settingsStore...），**禁止**上帝 store
- state + actions 同文件定义；异步 action 里调用 invoke 封装层
- 类型从 `src/types/` 引入，**禁止** any

## 使用方式

- 组件中用 selector 订阅：`useSessionStore(s => s.sessions)`，**禁止**解构整个 store（导致全量重渲染）
- 派生数据用 selector 组合或 `useMemo`，不冗余存储
- 事件驱动的更新（pty:output 等）在 store 的 action 里做，组件只订阅展示

## 持久化

- 需要 UI 偏好持久化时用 zustand/middleware 的 persist，落 localStorage
- 业务数据（会话、Profile）**禁止**进 localStorage——一律走 Rust 侧 SQLite/JSONL

## 检查清单

- [ ] selector 订阅而非全量解构
- [ ] 无 Context 全局状态
- [ ] 业务数据未落 localStorage
