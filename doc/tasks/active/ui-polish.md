# UI 打磨（用户反馈驱动）

- 来源: 用户反馈（dev-loop 零散任务）
- 创建: 2026-11-04
- 状态: 进行中

## 任务清单

- [x] P1 滚动条样式统一（完成于 2026-11-04，做了什么：index.css 全局滚动条统一——webkit + Firefox 双语法细条（8px 槽/4px 视觉圆角滑条，muted-foreground 35%/60% 跟随明暗主题）；xterm 滚动条从 16px 直角对齐为同观感（覆盖内联样式）；删除 md-body/md-table-wrap 局部段（全局接管）与 .transfer-log-table .ant-* 死样式 44 行（旧 AntD Table 遗留））
  - 验收: 全部 overflow 容器（侧栏树/设置面板/帮助/Transcript/日志表/终端）滚动条统一为 macOS 细条观感；`tsc` + `vite build` 通过，HMR 实时生效
