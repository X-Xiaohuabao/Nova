---
name: project-navigator
description: |
  TeaCoder 项目结构导航：找文件、定位代码、理解模块边界。

  触发场景：
  - 不确定某个功能代码在哪
  - 需要了解目录结构/模块职责
  - 新会话快速定位
---

# TeaCoder 项目导航

## 项目一句话

TeaCoder：AI 编程 CLI 工具（Claude Code / Codex / Gemini / OpenCode）的桌面管理客户端，Tauri 2.x + React 19。核心原则：PTY 直通、零额外 Token。

## 目录地图

```
src-tauri/src/          # Rust 后端
├── pty/                # PTY 终端管理（portable-pty）
├── cli/                # CLI 工具检测与启动
├── profile/            # Profile 管理（CLAUDE_CONFIG_DIR 隔离）
├── cost/               # Token 费用追踪（CostProvider trait + 各 CLI 适配）
├── storage/            # SQLite + JSONL 存储
├── crypto/             # 凭据加密
├── commands/           # Tauri IPC 命令
├── session*/           # 会话/分类/消息
├── ssh/                # SSH + sFTP
├── llm_provider/       # LLM 供应商管理
├── tool_settings/      # 各 CLI 工具设置
├── main.rs / lib.rs / tray.rs
src/                    # React 前端
├── components/         # terminal/tabs/profile/cost/settings/layout/panes/...
├── stores/             # Zustand stores
├── types/              # TS 类型（与 Rust 结构体对齐）
├── utils/              # 工具（invoke 封装等）
├── themes/             # 主题
doc/                    # 文档
├── requirements.md     # 需求
├── teacoder-roadmap.md # 路线图
├── 待办清单.md / 项目状态.md / tasks/   # 流水线文档
.zcode/                 # ZCode 工作区配置（命令/技能/hooks）
```

## 找代码的路径

1. **功能入口（后端）**：先看 `src-tauri/src/commands/` 的 IPC 命令 → 顺藤摸瓜到领域模块
2. **功能入口（前端）**：`src/components/<领域>/` → store → invoke 封装
3. **数据结构**：`src/types/`（前端）/ 各领域模块的 struct（后端）
4. **表结构**：`src-tauri/migrations/`

## 技术栈速查

Tauri 2.x / axum(127.0.0.1:49999) / portable-pty / rusqlite / keyring / tokio / thiserror / React 19 / AntD 6 / Tailwind 4 / Zustand / xterm.js
