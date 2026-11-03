/**
 * 平台桥接层 — 类型与 WebSocket 帧协议定义。
 *
 * 同一套 UI 运行在两种运行时上：
 * - tauri-desktop：Tauri WebView 内，invoke/listen 走 Tauri IPC
 * - web-remote：手机/网页端经 WebSocket 连回本地应用，走 WS RPC 帧协议
 *
 * 领域 API（src/utils/ipc.ts）只依赖 Bridge 接口，不感知底层通道；
 * 远程访问特性（独立立项）交付 WS 服务端后，web-remote 即为完整可用通道。
 */

/** 取消监听函数 */
export type UnlistenFn = () => void;

/** 桥接通道类型 */
export type BridgeKind = "tauri" | "websocket";

/** 运行时形态（决定 UI 形态：窗口控制显隐、布局模式等） */
export type RuntimeKind = "tauri-desktop" | "web-remote";

/** 平台桥接接口：UI 与后端通信的唯一入口 */
export interface Bridge {
  readonly kind: BridgeKind;
  /** 调用后端命令（与 Tauri command 同名同参） */
  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  /** 监听后端事件（与 Tauri event 同名），返回取消监听函数 */
  listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn>;
}

/* ============ WebSocket 帧协议（invoke 双向 + 事件单向推送） ============ */

/** 手机端 → 本地：命令请求帧 */
export interface WsInvokeFrame {
  type: "invoke";
  /** 请求 id（uuid），用于匹配 result 帧 */
  id: string;
  /** 命令名，与 Tauri command 同名同参 */
  cmd: string;
  args?: Record<string, unknown>;
}

/** 本地 → 手机端：命令结果帧 */
export type WsResultFrame =
  | { type: "result"; id: string; ok: true; data: unknown }
  | { type: "result"; id: string; ok: false; error: string };

/** 本地 → 手机端：事件推送帧（对应 Tauri event） */
export interface WsEventFrame {
  type: "event";
  event: string;
  payload: unknown;
}

export type WsFrame = WsInvokeFrame | WsResultFrame | WsEventFrame;
