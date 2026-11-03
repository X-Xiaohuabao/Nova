# 远程访问 — WS 服务端（局域网阶段）

- 来源: 用户指令（"WS 监听开始着手做，外网穿透延后"）；需求文档: doc/requirements-remote-access.md
- 创建: 2026-11-03
- 状态: 进行中
- 节奏约定: 每轮 `/dev-loop` 一个最小提交；`cargo clippy -- -D warnings` + `cargo test` 必过

## 任务清单

- [x] RA1 红线修订与立项文档（完成于 2026-11-03，未提交，做了什么：AGENTS.md/CLAUDE.md 新增 remote_access 红线条款（默认关闭+显式开启+强制鉴权+日志脱敏）两份同步；需求文档与台账就位）
  - 验收: AGENTS.md / CLAUDE.md 新增 remote_access 红线条款（默认关闭+显式开启+强制鉴权）且两份一致；需求文档与台账就位
  - 涉及: AGENTS.md、CLAUDE.md、doc/requirements-remote-access.md、本台账
- [x] RA2 配置持久化与 IPC 命令（完成于 2026-11-03，未提交，做了什么：复用 v7 app_settings 键值表（remote_enabled/remote_port 两键，免新迁移）；src-tauri/src/remote_access/mod.rs（RemoteAccessConfig + get/set_config，事务写入，缺失键回落默认关闭）；commands/remote_access.rs 两命令注册进 lib.rs；前端 types/RemoteAccessConfig + ipc.ts 封装；3 个中文命名单测通过）
  - 验收: ~~迁移 v{N}_remote_access_config.sql~~ 复用 app_settings（enabled 默认 false / port 默认 47001）；`remote_get_config` / `remote_set_config` 命令注册且读写持久化生效；clippy + test 通过（3 passed）
  - 涉及: src-tauri/src/remote_access/、storage/（复用 app_settings）、commands/、src/types/、src/utils/ipc.ts
  - 依赖: RA1
- [ ] RA3 WS 服务骨架（帧协议）
  - 验收: enabled=true 时监听 0.0.0.0:port，false 时端口不监听（set_config 联动启停）；invoke/result 帧收发正确（id 匹配）；命令白名单注册表就位（仅 remote_ping）；`GET /` 服务前端静态资源；clippy + test 通过
  - 涉及: src-tauri/src/remote_access/
  - 依赖: RA2
- [ ] RA4 配对鉴权
  - 验收: 握手首帧必须 auth（6 位配对码，5 分钟有效，开启时重新生成）；通过后签发会话令牌（存哈希）回 auth_ok；错误 3 次断连冷却 30 秒；`remote_get_pairing_code` 命令可用；日志无明文码/令牌；clippy + test 通过
  - 涉及: src-tauri/src/remote_access/
  - 依赖: RA3
- [ ] RA5 设置面板功能落地（随 UI 重构 T10 排期）
  - 验收: RemoteAccessPage 新组件实现开关（联动启停）/端口/配对码倒计时/服务状态/连接测试；手机同局域网浏览器完成配对后 remote_ping 全链路通
  - 涉及: src/components/settings/（新 RemoteAccessPage）
  - 依赖: RA4、UI 重构 T10

## 边界（本特性不做）

- 外网穿透 / 公网访问（延后另议）
- TLS（局域网阶段接受明文）
- 多设备并发、PTY 终端流远程转发
- 凭据类命令入白名单（永久禁止）

## 备注

- 每完成一项立即勾选并附「做了什么 + 提交短 hash」
- 帧协议以 src/lib/bridge/types.ts 为准（前端已实现客户端），新增 auth 帧需同步更新该文件注释
- 命令白名单扩充需在需求文档登记，凭据类永久禁止
