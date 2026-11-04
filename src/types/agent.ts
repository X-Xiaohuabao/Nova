/**
 * 智能体统一聊天接入 — 类型定义。
 *
 * 与 src-tauri/src/agent/mod.rs 的 serde 序列化输出严格对齐：
 * AgentEvent 以 `kind` 判别（snake_case 变体名），字段 camelCase；
 * 事件负载（sessionId + event）经 `agent:message` / `agent:state` 推送。
 */

/** 智能体会话运行状态（Rust AgentSessionState，snake_case 序列化） */
export type AgentSessionState =
  | "starting"
  | "thinking"
  | "waiting_input"
  | "idle"
  | "error";

/** 一轮对话用量统计（CLI result 消息上报；仅聊天内即时展示，权威数字走 cost 模块） */
export interface TurnUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
  costUsd: number | null;
}

/** Driver 归一事件（Rust AgentEvent 镜像） */
export type AgentEvent =
  | { kind: "session_ready"; cliVersion: string | null; claudeSessionId: string | null }
  | { kind: "message_delta"; delta: string }
  | { kind: "message_complete"; text: string }
  | {
      kind: "tool_use";
      toolUseId: string;
      name: string;
      input: unknown;
    }
  | {
      kind: "tool_result";
      toolUseId: string;
      content: string;
      isError: boolean;
    }
  | {
      kind: "permission_request";
      requestId: string;
      toolName: string;
      input: unknown;
    }
  | { kind: "question_request"; toolUseId: string; input: unknown }
  | { kind: "turn_ended"; usage: TurnUsage; isError: boolean; durationMs: number | null }
  | { kind: "state_changed"; state: AgentSessionState }
  | { kind: "error"; message: string }
  | { kind: "session_ended"; reason: string | null };

/** agent:message / agent:state 事件负载 */
export interface AgentEventPayload {
  sessionId: string;
  event: AgentEvent;
}

/** 权限确认卡的待答视图（T5 渲染，应答后固化） */
export interface PermissionRequestView {
  requestId: string;
  toolName: string;
  input: unknown;
  /** 用户已应答后的固化记录（"allow" | "deny" | null=待答） */
  answered: "allow" | "deny" | null;
}

/** AskUserQuestion 选项 */
export interface QuestionOptionView {
  label: string;
  description?: string;
}

/** AskUserQuestion 单个问题（tolerant 解析后的视图形态） */
export interface QuestionItemView {
  question: string;
  header?: string;
  options: QuestionOptionView[];
  multiSelect: boolean;
}

/** 问题选择卡的待答视图 */
export interface QuestionRequestView {
  toolUseId: string;
  questions: QuestionItemView[];
}

/** 工具调用折叠卡片视图（design doc §3） */
export interface ToolUseView {
  toolUseId: string;
  name: string;
  input: unknown;
  /** CLI 回填的执行结果（tool_result 到达后填充） */
  resultContent?: string;
  isError?: boolean;
}

/** 聊天消息（design doc §3 非对称形态的数据载体） */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** AI 消息流式进行中（打字机光标显示依据） */
  streaming: boolean;
  createdAt: number;
  /** 本条 AI 消息内嵌的工具调用卡片 */
  toolUses?: ToolUseView[];
  /** 轮结束统计（挂在轮末尾的 AI 消息上） */
  usage?: TurnUsage;
  /** 发送失败 / 运行错误标记（红边条 + 重试按钮的依据） */
  error?: boolean;
}
