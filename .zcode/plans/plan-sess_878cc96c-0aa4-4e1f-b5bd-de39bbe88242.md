# TeaCoder → Nova 全套更名 + 数据迁移计划

## Context

用户要将项目从 TeaCoder 更名为 Nova，并调整 Git 远程：上游 `yingcongshaw/teacoder` 无 push 权限，因此 **fork 仓库在 GitHub 上改名为 Nova**（fork 关系保留），`origin` 指向新地址，`upstream` 不动。协议层面已确认合规（MIT 允许改名，需保留原版权行）。

**探索阶段的关键发现**：SQLite 路径走写死的 `~/.teacoder`（`storage/mod.rs:15`），与 identifier 无关——换 identifier 本身不丢数据；真正需要迁移的是三处：数据目录、keychain service 名（`com.teacoder.app`）、前端 17 个 localStorage 持久化键。

## 已确认的决策

| 项 | 旧值 | 新值 |
| --- | --- | --- |
| GitHub 仓库 | X-Xiaohuabao/nvo-switch | X-Xiaohuabao/Nova（网页手动改名，旧 URL 自动重定向） |
| identifier / keychain service | com.codingtea.teacoder / com.teacoder.app | `com.xiaohuabao.nova`（两者统一） |
| productName / 窗口 title / crate | TeaCoder / teacoder / teacoder_lib | Nova / nova / nova_lib |
| 数据目录 / DB 文件 | ~/.teacoder / teacoder.db | ~/.nova / nova.db |
| 外链（About/帮助/README） | yingcongshaw/teacoder | https://github.com/X-Xiaohuabao/Nova |

## 实施步骤

### 阶段 0：Git 准备
1. 用户手动：GitHub 仓库 Settings → 改名 `nvo-switch` → `Nova`（我给步骤，gh 不可用无法代办）
2. 本地 `git remote set-url origin https://github.com/X-Xiaohuabao/Nova.git`（upstream 不动）
3. 当前 3 个文件有未提交改动（上一任务遗留）：先 `git stash`，更名完成后 pop 继续验证

### 阶段 1：代码与迁移（提交 1：`feat: 项目更名 Nova——标识符/持久化键/数据目录迁移`）

**Rust 侧**
- `src-tauri/Cargo.toml`：`name`/`default-run`/`[lib] name` → nova / nova_lib，description 同步；联动 `main.rs:5`、`tests/start_session_llm_integration.rs:10-11`
- `src/storage/mod.rs`：
  - 路径改为 `.join(".nova")` / `nova.db`
  - 新增 `migrate_legacy_data_dir()`（在 `create_dir_all` 前调用）：`~/.teacoder` 存在且 `~/.nova` 不存在 → `fs::rename` 整目录（同盘原子；失败降级为不迁移+日志，旧数据保留可恢复）；rename 后将目录内 `teacoder.db` 及 `-wal`/`-shm` 伴生文件改名
  - 仅当迁移发生时，参数化 SQL 兜底修复 `profiles.app_data_root`（REPLACE 三种前缀：Windows 绝对路径 / Unix 绝对路径 / `~/.teacoder` 波浪号形式）
- `src/crypto/keychain.rs`：`SERVICE_NAME` → `com.xiaohuabao.nova`；新增 `migrate_legacy_service(db)`：枚举 profiles × {api_key, oauth_token, oauth_refresh_token}，旧 service 读到且新 service 无值 → 写新 → 删旧；任一步失败仅记日志不阻断启动，凭据值不落日志（security-keychain 规范）
- `src/lib.rs` setup：`AppDatabase::new`（:53）之后调用 keychain 迁移
- `tauri.conf.json`：productName / identifier / 窗口 title
- 顺手：`askpass.rs:28-29` 临时文件名、5 处测试代码临时目录名、注释中的 TeaCoder 字样

**前端侧**
- 新建 `src/lib/legacyStorageMigration.ts`：**模块顶层副作用**执行 17 键映射迁移（`teacoder_*`→`nova_*`、`teacoder-*`→`nova-*`；旧值存在且新键为空才写入并删旧键）；在 `main.tsx` **第一个 import**（zustand persist 在模块顶层 rehydrate，main 顶层函数调用来不及）
- 逐处替换：appStore 11 键、shellStore persist `nova-shell-ui`、themeStore `nova-theme-mode`（legacy 源键改指 `nova_general_settings`，保持迁移链等价）、`teacoder_language`（i18n/index.ts 与 GeneralSettingsNext **两处同改**）、ws-bridge token 键、Onboarding 2 键、Keybindings/McpAccess/Network/Notification 4 键
- MIME 2 处：`application/x-nova-tab`、`application/x-nova-sidebar`
- 展示文案：WindowFrame title×2、StatusBarShell、AboutNext（名+外链）、DataManagementNext `~/.nova`、ProfileManagementNext 占位符、markdownShared REPO_URL、i18n 6 处（两语言各 3）
- `package.json` name → `nova`；`index.html` title → `Nova`（顺手修复模板默认值）
- `LICENSE`：原版权行**原样保留**，其下追加 `Copyright (c) 2026 X-Xiaohuabao (Nova)`（MIT 合规）

### 阶段 2：文档与脚手架（提交 2：`docs: 文档与 .zcode 脚手架同步更名 Nova`）
- `git mv doc/teacoder-roadmap.md doc/nova-roadmap.md`，同步修 `.zcode` 里 6 处路径引用（next/progress/kickoff/dev-loop/项目状态模板/writing-plans/project-navigator）
- README（~24 处含 clone/releases/安装包名）、AGENTS.md 与 CLAUDE.md（两文件保持同步）、doc/*.md 正文、.zcode commands/templates/skills 文案、hooks/pre-tool-use.cjs 用户可见提示
- **保留不改**（历史记录，改了反而失真）：`.github/release-notes/v0.1.1.md`、`doc/tasks/done/` 归档台账

### 收尾（用户手动）
- 工作目录文件夹 `nvo-switch` → `nova` 最后手动改（会断当前会话工作目录，不入本计划提交）

## 验证
1. 检查链：`cargo clippy -- -D warnings` + `cargo test` + `pnpm exec tsc --noEmit`
2. 迁移端到端：关应用 → 将 `~/.nova` 改回 `~/.teacoder`/`teacoder.db` 造旧数据、DevTools 预置 `teacoder_*` 键 → `pnpm tauri dev` 启动 → 验证目录/DB 已迁移、localStorage 新键有值、设置/标签页/主题保留、有凭据的 profile 仍能取到 Key（keychain 迁移）
3. `git push origin master` 确认新 remote 通畅（旧地址重定向仅 GitHub 网页生效，本地凭据不变即可推）

## 实施时激活技能
rust-coding、storage-sqlite、security-keychain、tauri-ipc、react-frontend、git-workflow