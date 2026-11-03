/**
 * 智能体统一接入 — 类型占位（命名段预留）。
 *
 * 本文件仅为「聊天 UI → 工厂模式转发各 CLI」特性预留 IPC 类型命名段，
 * 具体实现（AgentBackend trait、agent_* 命令、agent:* 事件）由独立立项交付；
 * 详见 doc/requirements-ui-refactor.md 第 5 节与 tauri-ipc skill 的命名段预留声明。
 * 任何其他特性禁止占用 agent 命名段。
 */

/** 支持的智能体 CLI 类型 */
export type AgentKind = "claude" | "codex" | "gemini" | "opencode";

/** 智能体流式消息块（对应规划中的 agent:message 事件负载） */
export interface AgentMessageChunk {
  /** 所属聊天会话 id */
  sessionId: string;
  /** 单调递增序号，用于乱序重组 */
  seq: number;
  /** 块类型：正文 / 工具调用 / 错误 */
  kind: "text" | "tool_use" | "error";
  /** 文本内容 */
  text: string;
}

/** 智能体会话运行状态（对应规划中的 agent:state 事件负载） */
export type AgentSessionState = "idle" | "thinking" | "waiting_input" | "error";
