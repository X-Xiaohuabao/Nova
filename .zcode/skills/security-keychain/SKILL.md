---
name: security-keychain
description: |
  凭据与安全规范：系统 Keychain（keyring）、脱敏、监听地址。

  触发场景：
  - 存储/读取 API Key、OAuth Token
  - Profile 导出/导入
  - 日志输出、错误信息展示
  - 任何涉及密钥、凭据、加密的操作
---

# 凭据与安全规范

## 存储（红线）

- API Key / OAuth Token **必须**通过系统 Keychain 存储（`keyring` crate）
- 🔴 **禁止**将 API Key 明文写入 SQLite、JSONL、日志或任何文件
- 凭据相关代码在 `src-tauri/src/crypto/`；Profile 凭据走系统 Keychain，LlmProvider 凭据走 SQLite（Base64 编码）是其当前设计，新增凭据一律优先 Keychain

## 脱敏

- 日志中所有 API Key 必须脱敏：显示 `sk-***...` 格式（保留前 3-5 位）
- Profile 导出时 API Key **必须**脱敏或排除
- 错误信息、IPC 返回值中不得携带完整密钥

## 网络

- axum 网关**仅监听 127.0.0.1**（端口 49999），**禁止**绑定 0.0.0.0
- 新增网络请求需说明用途（仅允许：CLI 自身 API 调用、费用探活、版本检查）

## IPC

- 🔴 **禁止**在 IPC 通道中传递 API Key 明文——传 Keychain 引用标识，Rust 侧按需取用

## 代码检查

- 提交前扫描：`sk-[A-Za-z0-9]{20,}`、`AKIA[A-Z0-9]{16}` 等密钥模式（pre-tool-use hook 会自动拦截）
- 发现测试用的真实密钥立即移除，换 placeholder
