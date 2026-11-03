---
name: profile
description: |
  Profile 管理：账号隔离（CLAUDE_CONFIG_DIR）、LLM 供应商切换、凭据分层。

  触发场景：
  - Profile 的创建/切换/导出
  - CLAUDE_CONFIG_DIR、账号数据隔离
  - LLM 供应商（LlmProvider）管理
  - 凭据存储分层
---

# Profile 规范

## 四层概念

Profile（账号环境隔离）→ 里面配置 LLM Provider（会话可独立选择模型/供应商）。
Profile 管理代码在 `src-tauri/src/profile/`，前端在 `src/components/profile/`。

## 隔离机制

- 每个 Profile 独立的 `CLAUDE_CONFIG_DIR`，账号数据完全隔离
- 打开 CLI 工具前按 Profile 注入环境变量；切换 Profile 必须彻底（进程级，不残留旧环境）

## 凭据分层

- Profile 凭据 → 系统 Keychain（keyring crate）
- LlmProvider 凭据 → SQLite（Base64 编码存储）
- 🔴 任何一层都禁止明文落盘；导出 Profile 时凭据必须脱敏或排除

## ⚠️ 已知行为（不要当 Bug 修）

- 打开 Claude Code 时会**清空其 settings.json 的 ENV 环境变量**（可用 CC Switch 还源）——这是实现多会话多供应商的已知取舍

## 检查清单

- [ ] 切换 Profile 后无旧环境残留
- [ ] 凭据走对应分层，未明文落盘
- [ ] 导出内容已脱敏
