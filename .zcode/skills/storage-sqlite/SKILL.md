---
name: storage-sqlite
description: |
  数据存储规范：SQLite (rusqlite)、schema 迁移、JSONL 读取。

  触发场景：
  - 新建/修改表结构、编写迁移
  - SQLite 查询、事务
  - Token 统计的 JSONL/本地数据文件解析
---

# SQLite + JSONL 存储规范

## SQLite（rusqlite）

- schema 版本化，从 v1 开始，每次变更递增
- 迁移脚本放 `src-tauri/migrations/`，命名 `v{N}_description.sql`
- 🔴 **禁止** `ALTER TABLE` 删除列——用新增列 + 代码层忽略
- 所有表必须有 `created_at` / `updated_at`（INTEGER，Unix 时间戳毫秒）
- 写操作用事务（`transaction`）保证原子性
- 查询必须参数绑定，**禁止**字符串拼接 SQL

## JSONL（CLI 工具本地数据）

- Token/费用统计读取 Claude Code / Codex / Gemini / OpenCode 的本地 JSONL 或数据库
- 解析代码在 `src-tauri/src/cost/`（见 cost-tracking 技能）
- 🔴 **只读**这些文件：禁止写入/移动/删除 CLI 工具自身的数据文件
- 解析必须容错：JSONL 可能有半行/损坏行，坏行跳过不崩溃

## 数据边界

- 本地优先：所有 TeaCoder 自身数据存本地（SQLite + JSONL）
- 🔴 **禁止**引入任何云端服务端依赖
- 网络请求仅限：CLI 工具自身的 API 调用、费用探活、版本检查

## 检查清单

- [ ] 新表有 created_at/updated_at
- [ ] 迁移编号递增且幂等
- [ ] 无 DROP COLUMN
- [ ] 无 SQL 拼接
