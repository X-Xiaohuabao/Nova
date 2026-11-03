/**
 * 平台桥接入口：按运行时自动选择通道。
 *
 * UI 组件与领域 API（src/utils/ipc.ts）一律通过 getBridge() 通信，
 * 不感知底层是 Tauri IPC 还是 WebSocket；未来切换通道只改此处。
 */

import { isTauri } from "@/lib/tauri/env";
import { tauriBridge } from "./tauri-bridge";
import { WebSocketBridge } from "./ws-bridge";
import type { Bridge, RuntimeKind } from "./types";

/** WebSocket 桥接单例（web-remote 运行时使用） */
let wsBridge: WebSocketBridge | null = null;

/** 获取当前运行时的桥接通道 */
export function getBridge(): Bridge {
  if (isTauri()) return tauriBridge;
  if (!wsBridge) wsBridge = new WebSocketBridge();
  return wsBridge;
}

/** 获取 WebSocket 桥接单例（供远程访问特性执行 connect/disconnect） */
export function getWebSocketBridge(): WebSocketBridge {
  if (!wsBridge) wsBridge = new WebSocketBridge();
  return wsBridge;
}

/** 当前运行时形态：桌面 Tauri / 网页远程 */
export function runtimeKind(): RuntimeKind {
  return isTauri() ? "tauri-desktop" : "web-remote";
}

export type { Bridge, BridgeKind, RuntimeKind, UnlistenFn } from "./types";
