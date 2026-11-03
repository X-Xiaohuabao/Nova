# /check - 全栈代码规范检查（TeaCoder）

作为代码规范检查助手，自动检测项目代码是否符合 TeaCoder 规范（AGENTS.md / CLAUDE.md）。

---

## 使用方式

```
/check          # 全量检查（提交前必跑）
/check rust     # 只查 Rust 后端
/check fe       # 只查前端
/check commit   # 提交前自检（快速档）
```

---

## 检查模式

### 🦀 Rust 后端（check rust / 全量）

| 检查项 | 方式 | 级别 |
|--------|------|------|
| 编译通过 | `cargo check`（在 src-tauri/ 下） | 🔴 阻断 |
| clippy 无 warning | `cargo clippy` | 🔴 阻断 |
| 单元测试 | `cargo test` | 🔴 阻断 |
| `unwrap()` 滥用 | 扫描非测试代码中的 `.unwrap()` | 🔴 阻断（测试代码豁免） |
| `Box<dyn Error>` 返回 | 扫描函数签名 | 🟡 警告（应改 thiserror） |
| 混用 async-std | 扫描 `use async_std` | 🔴 阻断 |
| 硬编码路径分隔符 | 扫描 `"/"` 拼接路径（应用 `PathBuf`） | 🟡 警告 |
| 明文密钥 | 扫描 `sk-`、`AKIA` 等密钥模式 | 🔴 阻断 |
| 0.0.0.0 监听 | 扫描 axum bind | 🔴 阻断（仅允许 127.0.0.1） |
| 公共 API 缺 `///` | 抽查 pub fn | 🟡 警告 |

### ⚛️ 前端（check fe / 全量）

| 检查项 | 方式 | 级别 |
|--------|------|------|
| 类型检查 | `pnpm exec tsc --noEmit` | 🔴 阻断 |
| 构建 | `pnpm build`（可选，耗时） | 🟡 建议 |
| `any` 类型 | 扫描 `: any` / `as any` | 🔴 阻断 |
| class 组件 | 扫描 `extends React.Component` | 🔴 阻断 |
| `console.log` | 扫描生产代码 | 🔴 阻断（`console.debug` 豁免，提交前清理） |
| Context + useReducer 做全局状态 | 抽查 stores/ 之外的 createContext | 🟡 警告（应改 Zustand） |
| Tailwind 覆盖 AntD 样式 | 抽查同时含 antd 组件与 `!important` 的文件 | 🟡 警告 |
| TODO/FIXME/HACK 注释 | 全量扫描 | 🟡 警告（要么解决要么开 issue） |

### 🗄️ 存储规范（全量时附带）

- 迁移文件命名：`src-tauri/migrations/v{N}_description.sql`，编号递增
- 禁止 `ALTER TABLE ... DROP COLUMN`
- 表必须有 `created_at` / `updated_at`（INTEGER，Unix 毫秒）

### 📦 提交前自检（check commit，快速档）

只跑阻断项：
```bash
cd src-tauri && cargo clippy -- -D warnings && cargo test
pnpm exec tsc --noEmit
git diff --cached | grep -nE "console\.log|: any|sk-[A-Za-z0-9]{20,}" # 已暂存内容抽查
```

---

## 输出格式

```
## 🔍 TeaCoder 规范检查报告

### 阻断项（必须修复才能提交）
- [rust] src-tauri/src/pty/mod.rs:123 使用 .unwrap() → 改为 Result 传播

### 警告项（建议修复）
- [fe] src/components/tabs/TabBar.tsx:45 含 TODO 注释

### 通过项
✅ clippy 无 warning  ✅ tsc 通过  ✅ 无明文密钥  ✅ 监听地址合规

### 结论
{可以提交 / 修复 N 个阻断项后再提交}
```

## 约束

- 只报告**当前改动相关文件**的警告项（全量扫描只用于阻断类模式匹配），避免噪音
- 所有阻断项必须给出**修复建议**，不只是指出问题
- 检查发现架构红线违规（PTY 拦截、明文密钥、0.0.0.0）时，无论什么模式都升级为阻断
