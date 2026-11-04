# /dev - 开发新功能（Nova 标准开发流程）

作为特性开发助手，按 Nova 的架构约束完成一个功能点的完整实现：**Rust 侧先行 → TS 侧封装 → UI 组件 → 即时验证**。

## 🎯 适用场景

- ✅ 新的 Tauri IPC 命令 / 事件（如 `session_search`、`profile:updated`）
- ✅ 新的 UI 功能模块（设置页、组件、面板）
- ✅ 新的存储需求（SQLite 表 / 迁移 / JSONL 解析）
- ✅ 新的 CLI 工具适配（如新增 provider）
- ❌ 跨多模块的大特性 → 先走 `/kickoff` 拆任务

## 🚀 执行流程

### 第一步：明确需求与影响面

向用户确认（或从任务台账读取）：
1. **功能名称与所属模块**（pty / cli / profile / cost / storage / session / ssh / settings / 前端某面板）
2. **是否跨前后端**：涉及哪些 IPC 命令、事件、表结构变更

### 第二步：先读规范再动手（强制）

按影响面激活对应技能，**一次一个**：
- 涉及 IPC → `tauri-ipc`（命令命名 `<领域>_<动作>`、事件命名 `<领域>:<事件>`）
- 涉及 Rust → `rust-coding`（禁 unwrap、thiserror、tokio）
- 涉及存储 → `storage-sqlite`（迁移放 `src-tauri/migrations/v{N}_description.sql`，禁 ALTER 删列）
- 涉及凭据 → `security-keychain`（Keychain 存储、日志脱敏）
- 涉及前端 → `react-frontend` + `antd-ui`（AntD 管组件、Tailwind 只管布局）
- 涉及状态 → `zustand-state`

### 第三步：实现顺序（强制）

1. **Rust 侧先行**：在 `src-tauri/src/` 对应领域模块实现，IPC 命令注册到 `src-tauri/src/commands/`
2. **TS 侧封装**：通过 `@tauri-apps/api` 的 `invoke` 封装调用，类型定义放 `src/types/`
3. **UI 组件**：放 `src/components/<领域>/`，全局状态放 `src/stores/`
4. **即时验证**：每个模块完成后立即 `pnpm tauri dev` 手动验证，不累积到最终

### 第四步：完成自检

- [ ] `cargo clippy` 无 warning
- [ ] `cargo test` 通过
- [ ] `pnpm exec tsc --noEmit` 通过
- [ ] 无 `unwrap()`、无 `any`、无 `console.log`
- [ ] 跨平台路径用 `PathBuf`，无硬编码分隔符
- [ ] 提交信息：`<类型>: <中文描述>`（如 `feat: 添加 Profile 管理界面`）

## 🔴 架构红线（任何时候不可违反）

- PTY 直通：禁止拦截/代理/修改 API 请求，禁止向 PTY 输出注入内容
- Token 统计读 CLI 本地数据文件，**非解析 PTY 输出**
- 凭据只走系统 Keychain；IPC 通道禁止传递明文 Key
- axum 网关仅监听 `127.0.0.1:49999`
- 禁止引入云端服务端依赖
