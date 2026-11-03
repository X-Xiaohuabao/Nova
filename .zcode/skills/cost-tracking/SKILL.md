---
name: cost-tracking
description: |
  Token 费用追踪：CostProvider trait、各 CLI 工具（claude/codex/gemini/opencode）适配。

  触发场景：
  - Token 统计、费用计算、费用面板
  - 新增 CLI 工具的费用适配
  - JSONL/本地数据解析、费用探活
---

# 费用追踪规范

## 架构

- 代码在 `src-tauri/src/cost/`：
  - `mod.rs` —— 模块入口
  - `provider.rs` —— `CostProvider` trait（所有 CLI 适配的统一接口）
  - `claude.rs` / `codex.rs` / `gemini.rs` / `opencode.rs` —— 各 CLI 适配器
- 新增 CLI 工具支持 = 实现一个新 `CostProvider`，**禁止**在 trait 外做特判分支

## 数据获取（红线）

- 🔴 Token 统计**只读** CLI 工具本地数据文件（JSONL / 数据库），**非解析 PTY 输出**
- 好处：CLI 协议怎么变都不影响统计准确性；PTY 输出零消费
- 读取到的文件**只读不写**，坏行容错跳过

## CostProvider 契约

- 输入：会话/Profile 标识（不包含明文凭据）
- 输出：统一的结构化用量（输入/输出 token、模型、时间戳、费用）
- 探活/拉取限流：费用探活是允许的网络请求之一，但需节流，**禁止**高频轮询

## 前端

- 费用 UI 在 `src/components/cost/`
- 数据更新通过 `cost:updated` 事件推送，**禁止**前端轮询 IPC

## 检查清单

- [ ] 新适配器实现了 CostProvider trait
- [ ] 未解析 PTY 输出
- [ ] 未写 CLI 工具的数据文件
- [ ] 无明文凭据参与请求签名以外的用途
