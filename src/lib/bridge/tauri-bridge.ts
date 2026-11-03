/**
 * Tauri 桌面端桥接实现：invoke/listen 直接转发到 Tauri IPC。
 */

import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import type { Bridge, UnlistenFn } from "./types";

export const tauriBridge: Bridge = {
  kind: "tauri",

  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    return tauriInvoke<T>(cmd, args);
  },

  async listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
    const unlisten = await tauriListen<T>(event, (e) => handler(e.payload));
    return unlisten;
  },
};
