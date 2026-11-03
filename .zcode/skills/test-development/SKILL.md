---
name: test-development
description: |
  测试规范：cargo test、tsc 类型检查、提交前检查链。

  触发场景：
  - 写单元测试
  - 提交前检查
  - 回归验证、测试覆盖率
---

# 测试规范

## 检查链（提交前必跑）

```bash
cd src-tauri && cargo clippy -- -D warnings && cargo test
pnpm exec tsc --noEmit
```

三条全绿才算完成。`/check commit` 可作为快捷入口。

## Rust 测试

- 单元测试放同文件 `#[cfg(test)] mod tests`；测试代码**允许** unwrap
- 优先测：CostProvider 适配器的解析逻辑（喂样例 JSONL）、迁移幂等性、IPC 命令的边界输入
- SQLite 相关测试用内存库（`rusqlite::Connection::open_in_memory`）

## 前端测试

- 类型即测试：strict 模式 + 精确类型挡住大部分回归
- 纯函数（utils/）可加 vitest 用例（如引入了测试框架）；组件暂以 `pnpm tauri dev` 手动验证为主
- 手动验证点记录到任务台账的验收栏

## 纪律

- **修 Bug 必带防回归**：能用测试锁住的行为就写测试
- **禁止**为凑覆盖率写快照垃圾测试
- 测试失败时不跳过（`#[ignore]`/`it.skip`），要么修要么删并说明原因
