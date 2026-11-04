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

- 一个领域一个 store,命名 `<领域>Store.ts`;**禁止**上帝 store(万物桶)
- state + actions 同文件定义;异步 action 里调用 invoke 封装层
- 类型从 `src/types/` 引入,**禁止** any

### 拆分判据(可检查)

- **一句话测试**:能用"<领域>的状态"一句话描述且不带"和" → 合法;要列举多个域 → 必须拆
- 域划分参照:project / session / pane(标签布局)/ llmProvider / profile / ui(弹窗开关、视图态)/ terminalSettings / theme / shell / agent
- 新增状态先问:属于哪个既有域?找不到归属 → 新建 store;跨域组合 → 在组件侧用 selector 组合,**禁止**塞进无关 store

### 依赖规则

- store 之间**禁止循环依赖**(A 调 B、B 又调 A)。需要互通时:单向依赖 + 事件/回调打通,或提取公共逻辑下沉
- 实证教训:appStore ⇄ agentStore 双向调用,isRunning 三处真值,靠事件补丁互相修补
- action 内可跨 store **只读**(`useOtherStore.getState()`);跨 store 写 = 域划错了,重新划域

### 单一真相源

- **可计算的不存储**:派生状态用 selector 从源头算(如 panes → openTabIds),**禁止**两处存储手动双写
- 同一事实全应用只存一处;运行态(isRunning、通道状态)以后端为真值,store 只做缓存 + 事件收敛
- 发现两处存储同一事实 → 当轮修复,禁止"暂时先同步着"

### Action 职责

- action = 状态转移 +(可选)调用 IPC 封装,**禁止** UI 决策(切换活动 tab、打开弹窗属调用方)
- 多步编排(建库→启动→登记)拆成独立 action,由调用方编排;任一步失败要有显式回滚,禁止留半成品状态
- 实证教训:createSession 一体化做四件事,启动失败留下僵尸 tab 靠自愈逻辑兜底

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
- [ ] 一句话测试通过(无上帝 store);无 store 循环依赖、无跨 store 写
- [ ] 无双写派生状态(可计算的不存储)
- [ ] action 无 UI 决策、无不可回滚的多步编排
