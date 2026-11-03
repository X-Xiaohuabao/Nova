---
name: pty-terminal
description: |
  PTY 终端核心：portable-pty 伪终端、xterm.js 渲染、终端会话管理。

  触发场景：
  - PTY 会话创建/销毁/输出流
  - xterm.js 渲染、fit、插件
  - 多标签 + 分屏、共享 PTY 双开
  - 终端闪烁、乱码、输出丢失等问题
---

# PTY 终端规范

## 核心原则（红线）

- 🔴 **PTY 直通**：禁止拦截、代理或修改 CLI 工具的 API 请求
- 🔴 禁止向 PTY 输出流注入额外内容
- Token 统计通过读取 CLI 本地数据文件（JSONL/数据库），**非解析 PTY 输出**

## Rust 侧（portable-pty）

- PTY 管理代码在 `src-tauri/src/pty/`
- 输出流通过 `pty:output` 事件推给前端，**禁止**前端轮询
- 会话退出发 `pty:exit`；注意进程组清理，防止僵尸进程
- 读取循环必须可优雅终止（关闭信号），禁止 detach 后无人回收

## 前端侧（xterm.js）

- 终端组件在 `src/components/terminal/`
- 使用 `@xterm/addon-fit` 自适应尺寸；resize 时同步 PTY 大小
- 输出写入用批量 buffer（节流合并），避免每 chunk 一次 write 造成卡顿
- 主题跟随应用的终端主题设置（与系统主题分离）

## 多标签 + 分屏

- 最多 2 个 Pane 左右分屏
- 「共享 PTY 双开」：同一会话两端同步显示——同一输出流多消费者，**禁止**为双开创建两个 PTY 进程

## 常见问题排查

- 闪烁：检查是否重复创建 xterm 实例 / 未复用 DOM
- 中文乱码：检查编码（UTF-8）与 Windows ConPTY 配置
- 输出丢失：检查事件监听是否在组件卸载后未重挂
