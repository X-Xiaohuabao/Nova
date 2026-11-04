# 设计方案:会话 / 项目 / 全局 三层模型配置 + 交互重构

- 创建: 2026-11-04
- 状态: 已评审待实施(本文档为任务台账 `doc/tasks/active/session-model-config.md` 的真相源)
- 来源: 用户提出的目标 + 全仓摸底分析(后端数据模型 / 前端交互链路双线调查)

## 1. 用户目标(原话归纳)

1. 把需要用到的模型先配置好(模型库);
2. 新建对话处可动态切换**智能体 + 模型**(如选了 Claude Code,再选已配置好的模型);
3. 会话级:当前会话记住所选,重进该会话仍用之前的,且可随时切换;
4. 项目级:可对项目做默认配置;
5. 优先级:**会话 > 项目 > 全局**。

## 2. 现状与差距(摸底结论)

| 目标能力 | 现状 | 差距 |
| --- | --- | --- |
| 模型库 | `llm_providers` + `llm_provider_models`(v8 迁移),每供应商多模型 + 默认模型,15 个预设 | 基本满足 |
| 新建时选智能体→模型 | `NewSessionModalNext.tsx`(567 行、14 useState、5 useEffect)串联选择,claude 需 5 档映射,一次约 10 次交互 | 有功能无体验,无"默认直接开" |
| 会话记住选择 | `sessions.tool_type / llm_provider_id / model_name / claude_models` 已持久化(`src-tauri/src/session/mod.rs:12-34`),启动经 `--model` + env 注入(`commands/pty.rs:62-72`) | 数据层已成立;切换入口是 528 行编辑弹窗且需重启,双开时静默不生效(`appStore.ts:837-841`) |
| 会话中热切换 | 无 | claude/codex/gemini/opencode 均有 `/model` 类会话内命令,聊天通道可热切换 |
| 项目级默认 | `projects` 表仅 name/path/color/sort_order | **完全缺失** |
| 全局默认 | `llm_providers.is_default` 仅为 DB 标记,启动链路不消费;实际默认值来源有两套(供应商页 is_default vs 第一个 Profile 的 tool_settings 偏好,`NewSessionModalNext.tsx:170-231` 三级回退) | 无单一真相源 |
| 优先级链 | 散在弹窗 effect 链 | 需显式解析函数 |

结构性问题(交互难用的根因):

1. 新建流程把全量配置前置(10 类配置一次暴露,90% 场景只需默认值);
2. 三层概念各走各路:供应商/模型=会话级显式选;Profile=新建时不可见、运行时隐性 `find()` 第一个同工具 Profile(`ToolSettingsPageNext.tsx:81`);全局默认=两套来源;
3. 入口错位:侧栏 "+" 默认绑 `projects[0]`(`AppNext.tsx:317`),TabBar "+" 不传项目;
4. `appStore.ts` 1950 行万物桶(10+ 死状态、三处重复存储、panes/openTabIds 双写、与 agentStore 双向依赖、isRunning 三处真值);
5. New/Edit 会话弹窗整文件级复制(~150 行重复);删除确认 4 份重复实现;
6. `createSession` 内联"建库+启动+登记+改 panes"副作用,失败无回滚(`appStore.ts:763-819`);
7. 死代码:`tool_settings.model` 不进启动链路;`is_default` 无人消费。

## 3. 方案设计

### 3.1 数据层

**D1. projects 表新增默认配置**(迁移 `v17_project_default_llm.sql`;原稿记 v16,实施时 v16 已被 transfer_log 占用顺延)

```
default_tool_type        TEXT     -- 默认智能体(可空)
default_llm_provider_id  TEXT     -- 默认供应商 id(可空,引用 llm_providers.id 的 TEXT uuid;原稿误记 INTEGER)
default_model_name       TEXT     -- 默认模型名(可空)
default_claude_models    TEXT     -- claude 5 档映射 JSON(可空,与 sessions.claude_models 同构)
```

均 nullable,空 = 未设置(继续向上回退到全局)。

**D2. 三层解析,单一真相源**

新增后端解析(建议 IPC `resolve_session_defaults(project_id)` 或并入 `session_create` 入参归一化),回退顺序:

```
会话自身字段(已存在,不动)
  → 项目默认(v16 新增)
    → 全局默认(llm_providers.is_default + 其 default model;新增"全局默认智能体"存 tool_settings 或独立 kv)
      → 兜底:第一个可用 CLI 工具 + 第一个兼容供应商
```

同时**废除**"第一个同工具 Profile 的 tool_settings 偏好"这套暗规则(`NewSessionModalNext.tsx:214-231` 的异步猜测逻辑删除)。

**D3. Profile 定位拍板(需用户确认)**

推荐:Profile 保持"账号数据隔离"(`CLAUDE_CONFIG_DIR`/`CODEX_HOME` + keychain 凭据)定位不变;模型库 = LlmProvider;新建会话 UI 只暴露"智能体 + 供应商 + 模型"。Profile 与供应商的关联后续按需显式化(供应商上可加 `preferred_profile_id`,禁止运行时 `find()` 第一个)。

### 3.2 交互层

**I1. 新建会话弹窗重构**(`NewSessionModalNext.tsx`)

- 默认态一行:显示解析结果"将使用:Claude Code · GLM-4.7(项目默认)",一键创建;
- "高级配置"折叠区收纳:分类/名称/颜色/思考强度/模板/cli 参数/环境变量/claude 5 档映射;
- 智能体切换后模型下拉只列该工具兼容供应商下已配置的模型;
- 默认项目修正:取当前活动 tab 所属项目 → 无则最近使用项目,禁止硬编码 `projects[0]`。

**I2. 会话内轻量切换器**

位置:会话头部/状态栏(现有回显位 `AppNext.tsx:256-283` 升级为可点击)。交互:点开 dropdown → 选智能体/供应商/模型 → 写回 session 字段(session_update)→ 生效策略:
- 聊天通道(claude agent):发送 `/model <name>` 热切换;
- PTY 通道:更新字段 + 提示"下次重启会话生效"(不自动重启);
- 双开场景:明确提示不生效原因(替代现在的静默失败)。

**I3. 项目默认配置入口**

侧栏项目右键 → "默认模型配置"(或项目编辑弹窗加一组字段),直接编辑 D1 的三个字段。

### 3.3 结构层(配合交互重构,穿插进行)

- S1. 抽 New/Edit 共享逻辑(`useSessionForm` hook + 共享子组件),消除两份 ~150 行复制;
- S2. `createSession` 拆"创建"(纯入库)与"启动"(PTY/agent)两步,启动失败回滚(删库记录 + 不留僵尸 tab);
- S3. appStore 拆分:project/session/pane/provider/ui 域 store;删除死状态清单(`settingsPage`/`compactMode`/`fontSize`/`duplicateSession`/`locateSession`/`costTick`/`manualGuideOpen` 等);`openTabIds` 改为 panes 派生 selector;消除与 shellStore/themeStore 重复;
- S4. 统一删除确认为单个 `ConfirmDialog` 组件,替换 4 处重复实现;
- S5. 清理死代码:`tool_settings.model` 字段(保留表,停止展示)、两套默认值来源合一。

## 4. 里程碑与顺序

```
M1 数据层(D1-D3) → M2 新建弹窗(I1) → M3 会话切换器(I2) → M4 项目默认 UI(I3)
M5 结构重构(S1-S5)穿插在 M2-M4 各轮之间,每轮一个独立提交
```

前三步覆盖用户 80% 诉求;M3 完成后"会话记住 + 可切换"体验闭环。

## 5. 红线(本方案不违反)

- PTY 直通原则不变:`/model` 热切换走"作为用户输入发送"路径(与现有 pendingClaudeRenames 同机制),不拦截/代理 API;
- 凭据仍走 keychain/base64 现有分层,新增字段不含敏感信息;
- 迁移只加列不删列。
