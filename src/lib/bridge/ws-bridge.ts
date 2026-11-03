/**
 * WebSocket 桥接实现（web-remote 运行时）。
 *
 * 协议见 ./types.ts 的帧定义：invoke/result 双向 + event 单向推送 +
 * auth 握手（RA4）：连接后首帧必须 auth——既往会话令牌优先（断线重连免
 * 配对，服务端轮换新令牌回存），否则用 6 位配对码；auth_err 透出失败原因
 * （连续失败服务端会进入 30 秒冷却）。
 */

import type { Bridge, UnlistenFn, WsFrame, WsResultFrame } from "./types";

type Pending = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
};

/** 会话令牌本地存储键（web-remote 端；服务端只存哈希） */
const TOKEN_STORAGE_KEY = "teacoder-remote-token";

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
   * 建立与本地应用的 WebSocket 连接并完成配对认证。
   * @param url ws://<局域网IP>:<端口>/ws
   * @param pairingCode 6 位配对码（远程访问面板展示）；持有有效令牌时可省略
   */
  connect(url: string, pairingCode?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;
      let authed = false;

      ws.onopen = () => {
        this.ws = ws;
        // 握手首帧必须 auth：既往令牌优先（重连免配对），否则配对码
        const token = localStorage.getItem(TOKEN_STORAGE_KEY) ?? undefined;
        const frame = { type: "auth", token, code: pairingCode } satisfies WsFrame;
        ws.send(JSON.stringify(frame));
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket 连接失败: ${url}`));
        }
      };
      ws.onmessage = (e) => {
        if (!authed) {
          let frame: WsFrame;
          try {
            frame = JSON.parse(String(e.data)) as WsFrame;
          } catch {
            return;
          }
          if (frame.type === "auth_ok") {
            authed = true;
            settled = true;
            // 保存轮换后的令牌：断线重连免配对
            try {
              localStorage.setItem(TOKEN_STORAGE_KEY, frame.token);
            } catch {
              // 存储失败不阻塞会话（本次仍可用）
            }
            resolve();
            return;
          }
          if (frame.type === "auth_err") {
            settled = true;
            reject(new Error(frame.error));
            ws.close();
            return;
          }
          // 认证前的其它帧不符合协议，忽略
          return;
        }
        this.handleFrame(e.data);
      };
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
        if (!settled) {
          settled = true;
          reject(new Error("WebSocket 在认证完成前关闭"));
        }
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
        new Error("WebSocket 未连接：请先完成远程配对（设置 → 远程访问）"),
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
