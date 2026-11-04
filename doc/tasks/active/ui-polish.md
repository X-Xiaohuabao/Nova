# UI 打磨（用户反馈驱动）

- 来源: 用户反馈（dev-loop 零散任务）
- 创建: 2026-11-04
- 状态: 进行中

## 任务清单

- [x] P3 设置界面卡片分组（完成于 2026-11-04，做了什么：对齐 macOS 系统设置 Ventura 风格——新增 SettingsCard（圆角 bg-card 色块卡 + 行间 hairline divide）与 SettingsSection 一步写法；SectionHeader 调整为 13px medium 非 uppercase（卡片外标题）；SettingRow 改卡片内行样式（px-4 py-2.5）；全部 12 个设置页包裹卡片分组（General/Terminal 8 组/CLI 6 页走 ToolSettingsPageNext 模板/Network/Notification/Data/Mcp/About/Keybindings/RemoteAccess/LlmProviders/Profile））
  - 验收: 每组设置 = 标题（卡外）+ 圆角色块卡；`tsc` + `vite build` 通过，HMR 实时生效

- [x] P2 深色模式继承文字修复（完成于 2026-11-04，做了什么：index.css html 补 color: var(--foreground)——md-body 等依赖继承的正文在深色下不再是浏览器默认黑色；顺删孤儿组件 WindowControls.tsx 与 .window-control-btn 死样式段（被 TrafficLights 替代））
  - 验收: 产物含 color:var(--foreground) 继承链；`tsc` + `vite build` 通过

- [x] P1 滚动条样式统一（完成于 2026-11-04，做了什么：index.css 全局滚动条统一——webkit + Firefox 双语法细条（8px 槽/4px 视觉圆角滑条，muted-foreground 35%/60% 跟随明暗主题）；xterm 滚动条从 16px 直角对齐为同观感（覆盖内联样式）；删除 md-body/md-table-wrap 局部段（全局接管）与 .transfer-log-table .ant-* 死样式 44 行（旧 AntD Table 遗留））
  - 验收: 全部 overflow 容器（侧栏树/设置面板/帮助/Transcript/日志表/终端）滚动条统一为 macOS 细条观感；`tsc` + `vite build` 通过，HMR 实时生效
