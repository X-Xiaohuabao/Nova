---
name: git-workflow
description: |
  Git 提交与分支规范。

  触发场景：
  - 提交代码、写 commit message
  - 分支管理、合并、PR
  - git 操作相关的一切
---

# Git 工作流规范

## 提交信息

- 使用中文，格式：`<类型>: <描述>`
- 类型：`feat` / `fix` / `refactor` / `docs` / `chore` / `ci` / `style` / `test`
- 示例：`feat: 添加 Profile 管理界面`、`fix: Windows 下 CLI 工具检测失败的问题`
- 描述写"为什么/做了什么"一句话，不贴内部单号

## 提交纪律

- **一个任务一个提交**（dev-loop 的一轮一提交），不混入无关改动
- 提交前自检（走 `/check commit`）：`cargo clippy` + `cargo test` + `pnpm exec tsc --noEmit`
- 提交前清理 `console.debug` 调试残留
- 🔴 **禁止** `git push --force` 到 main/master（pre-tool-use hook 会拦截）
- 🔴 **禁止** `git reset --hard` 丢弃多个提交（除非用户明确要求）

## 分支

- 主分支 master；功能开发可在特性分支进行，小改动直接 master
- 提交前 `git pull --rebase` 保持线性历史（如远端有更新）

## 状态检查

- 提交后跑 `git status` 确认工作区干净，无漏 add 文件
- 发现未跟踪的临时文件（测试脚本、日志）→ 加入 .gitignore 或删除，不提交
