---
name: rust-coding
description: |
  Rust 后端编码规范：错误处理、异步、依赖选型、clippy 要求。

  触发场景：
  - 编写/修改 src-tauri/ 下的 Rust 代码
  - 错误处理、unwrap、thiserror、tokio
  - Cargo.toml 依赖变更、crate 选型
  - cargo clippy / cargo test 相关
---

# Rust 编码规范

## 错误处理

- 使用 `Result<T, E>` 处理所有错误，**禁止** `unwrap()`（测试代码豁免）
- 使用 `thiserror` 定义错误类型，**禁止** `Box<dyn Error>` 作为返回类型
- 错误信息用中文或英文均可，但必须可定位（带上下文）

## 异步与并发

- 异步运行时统一 `tokio`，**禁止**混用 `async-std`
- 锁竞争敏感场景优先 `tokio::sync::Mutex`（跨 await 持锁时**必须**用它）
- PTY 读循环等长任务注意优雅退出（取消令牌/关闭信号）

## 数据库与文件

- 数据库操作使用事务（`transaction`）确保原子性
- 路径处理使用 `PathBuf`，**禁止**硬编码 `/` 或 `\` 分隔符
- 文件操作使用 `std::fs` / tokio fs，**禁止** shell out 到 `cp`/`rm`/`mv`

## 代码质量

- 公共 API 必须有文档注释（`///`），内部函数不需要
- `cargo clippy` 必须无 warning（CI 档：`cargo clippy -- -D warnings`）
- 注释只在 WHY 不明显时添加；**禁止** TODO/FIXME/HACK

## 关键依赖（选型锁定）

tauri 2.x / axum（127.0.0.1:49999）/ portable-pty / rusqlite / keyring / serde + serde_json / tokio / thiserror / uuid / chrono

新增依赖需说明理由，禁止引入与上述功能重叠的 crate。
