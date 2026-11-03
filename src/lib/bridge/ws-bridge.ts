/**
 * WebSocket 桥接实现（web-remote 运行时）。
 *
 * 协议见 ./types.ts 的帧定义：invoke 双向请求/结果帧 + event 单向推送帧。
 * 连接管理（URL 发现、配对鉴权、断线重连）由「远程访问」特性交付，
 * 当前为协议完整的客户端骨架：未连接时 invoke 明确报错，不静默失败。
 */

import type { Bridge, UnlistenFn, WsFrame, WsResultFrame } from "./types";

type Pending = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
};

export class WebSocketBridge implements Bridge {
  readonly kind = "websocket" as const;

  private ws: WebSocket | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly handlers = new Map<string, Set<(payload: unknown) => void>>();
  private seq = 0;

  /** 当前是否已连接 */
  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * 建立与本地应用的 WebSocket 连接。
   * 鉴权方式（配对码/令牌）由远程访问特性定义后补充到握手流程。
   */
  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.onopen = () => {
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => reject(new Error(`WebSocket 连接失败: ${url}`));
      ws.onmessage = (e) => this.handleFrame(e.data);
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
      };
    });
  }

  /** 断开连接并清理挂起请求 */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    for (const p of this.pending.values()) {
      p.reject(new Error("WebSocket 已断开"));
    }
    this.pending.clear();
  }

  invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
    if (!this.connected) {
      return Promise.reject(
        new Error("WebSocket 未连接：远程访问特性尚未接入（独立立项交付）"),
      );
    }
    const id = `req-${++this.seq}-${Date.now()}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (data: unknown) => void, reject });
      const frame = { type: "invoke", id, cmd, args } satisfies WsFrame;
      this.ws?.send(JSON.stringify(frame));
    });
  }

  async listen<T>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    const wrapped = handler as (payload: unknown) => void;
    set.add(wrapped);
    return () => {
      set?.delete(wrapped);
      if (set && set.size === 0) this.handlers.delete(event);
    };
  }

  private handleFrame(raw: unknown): void {
    let frame: WsFrame;
    try {
      frame = JSON.parse(String(raw)) as WsFrame;
    } catch {
      return;
    }

    if (frame.type === "result") {
      const p = this.pending.get(frame.id);
      if (!p) return;
      this.pending.delete(frame.id);
      const result = frame as WsResultFrame;
      if (result.ok) {
        p.resolve(result.data);
      } else {
        p.reject(new Error(result.error));
      }
      return;
    }

    if (frame.type === "event") {
      const set = this.handlers.get(frame.event);
      if (!set) return;
      for (const h of set) h(frame.payload);
    }
  }
}
