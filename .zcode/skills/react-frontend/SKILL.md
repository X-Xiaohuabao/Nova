---
name: react-frontend
description: |
  React 19 + TypeScript 5 前端架构与编码规范:分层、单一职责、拆分判据、禁止写法对照表。

  触发场景:
  - 编写/修改 src/ 下的 React 组件
  - Props 类型定义、组件拆分、文件放哪一层
  - 渲染性能、hooks 使用
  - 新建组件/弹窗/表单/设置页前(先读参考代码表)
---

# React 前端规范

## 分层架构与依赖方向(强制)

```
src/types/          类型层:与 Rust 结构体对齐;被所有层引用,不引用任何层
src/utils/ipc.ts    IPC 层:唯一 invoke 出口,按领域分节
src/stores/         状态层:按域拆分的 Zustand store(见 zustand-state 技能)
src/hooks/          逻辑层:有状态逻辑复用;可读写 store、调 IPC
src/components/     视图层:渲染 + 交互编排;业务逻辑委托给 hooks/store
```

- 依赖只能**向下**:components → hooks → stores → utils/ipc;禁止反向(store import 组件、hooks 写 JSX)
- 组件**禁止裸 invoke**:一律走 `utils/ipc.ts` 封装函数(新增功能 = 在 ipc.ts 加函数,组件调函数)
- 组件私有 UI 态用 `useState`;仅当**多个不相关入口**都要触发(如右键菜单和快捷键都要开同一弹窗)才提升进 store 的 ui 域

## 单一职责落地判据(可检查)

1. **行数**:组件文件 >300 行必须拆;自定义 hook >200 行必须拆。超过阈值还想保留 = 在台账登记豁免理由
2. **一句话测试**:文件能用"XX 的 XX"一句话说清;描述里出现"和/以及/还有" → 拆
3. **复制检测**:同一段逻辑出现第二份 → 立即抽共享组件/hook/工具,两处改调用。**禁止"先复制后优化"**
4. **useState 联动**:单组件 >6 个 useState 且相互联动(如级联默认值)→ 表单逻辑抽自定义 hook
5. **effect 边界**:useEffect 只做与外部系统同步(事件监听/订阅/定时器);数据转换、默认值计算、派生禁止用 effect 链,改为集中式纯函数(一次算出)或 useMemo

## 禁止写法对照表(本项目实证,违反 = 回改)

| 禁止(错误做法) | 正确做法 | 实证教训 |
| --- | --- | --- |
| 上帝 store:一个文件管 10+ 个域 | 按域拆 store,一句话测试 | appStore.ts 长到 1950 行,混入 10+ 死状态 |
| 派生状态双写(改 A 后手动同步 B) | 只存一份,其余 selector 派生 | openTabIds 与 panes 双写,每个 mutation 都要手动同步两份 |
| 复制粘贴同构组件/逻辑 | 抽共享组件/hook | New/Edit 会话弹窗各 ~150 行重复,改一漏一 |
| 同一交互多份实现 | 全局唯一组件/方案 | 删除确认 4 份重复实现,风格不一 |
| store action 内联多步副作用且无回滚 | 拆成独立 action 由调用方编排,失败显式回滚 | createSession 建库+启动+登记+改 panes 一体,失败留僵尸 tab |
| 多处维护同一真值 | 单一真相源;运行态以后端为真值,store 做缓存+事件收敛 | isRunning 存三处靠事件互相修补 |
| 组件局部 UI 态提升进全局 store | 单入口弹窗用局部态 | 5 组弹窗开关 10 个字段进全局 store |
| effect 链手工联动表单默认值 | 集中式解析函数一次算出默认值 | 新建弹窗 5 个 effect 三级回退 + eslint 抑制注释 |

## 参考代码表(写前必读,按相同风格编写)

| 要写什么 | 先读 |
| --- | --- |
| 设置页 | `settings/next/GeneralSettingsNext.tsx` + `SettingRow`/`SettingsCard`(行式右栏模式) |
| 弹窗 | `common/ResponsiveDialog.tsx`(统一弹窗壳) |
| store | `shellStore.ts`(65 行最小范本)、`themeStore.ts`(persist 范本) |
| IPC 调用 | `utils/ipc.ts` 对应领域分节 |
| 确认交互 | shadcn-ui 技能的确认方案节;全局只用一种实现 |
| 聊天/消息流 | `chat/ChatView.tsx` + `agentStore.ts` 事件归约模式 |

## TypeScript

- 严格模式:`"strict": true`,**禁止**关闭
- Props 必须定义 interface/type,**禁止** `any`(含 `as any`)
- 后端返回数据类型统一放 `src/types/`,与 Rust 结构体对齐
- 组件文件 PascalCase(`SessionList.tsx`),工具文件 camelCase(`formatTime.ts`);组件放 `src/components/<领域>/`,通用组件放 `common/`

## Hooks

- 事件监听(`listen`)必须在 cleanup 中 `unlisten`
- **禁止**在渲染路径做昂贵计算(需要则 `useMemo`)

## 其他

- **禁止** `console.log` 进生产代码;调试用 `console.debug` 并提交前清理
- **禁止** TODO/FIXME/HACK 注释
- **国际化(强制)**:用户可见文案与 aria-label **禁止硬编码**,一律 `useTranslation()` + `t()` 走 `src/i18n/` 资源键
- 提交前 `pnpm exec tsc --noEmit` 必须通过

## 提交前自查清单

- [ ] tsc 通过;新文件行数在阈值内(或已登记豁免)
- [ ] 无第二份复制逻辑;无双写派生状态;组件无裸 invoke
- [ ] 分层正确:新文件落在架构图对应层,依赖方向未反向
- [ ] 文案无硬编码,走 t() 资源键
