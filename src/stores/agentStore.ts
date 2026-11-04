/**
 * 智能体聊天会话全局状态。
 *
 * 数据流：Rust `agent:message` / `agent:state` 事件 → applyAgentEvent（纯归约）
 * → 组件 selector 订阅渲染。事件归约与状态机转移拆为纯函数（同文件导出），
 * 不依赖 store 实例，便于单测与后续补充测试运行器后直接覆测。
 */

import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import i18n from "@/i18n";
import { useAppStore } from "@/stores/appStore";
import type {
  AgentEvent,
  AgentEventPayload,
  AgentSessionState,
  ChatMessage,
  PermissionRequestView,
  QuestionItemView,
  QuestionRequestView,
  ToolUseView,
} from "../types";
import {
  agentAnswerQuestion,
  agentInterrupt,
  agentRespondPermission,
  agentSend,
  agentSessionStart,
  agentSessionStop,
} from "../utils/ipc";

/** 消息 id 生成（store 内唯一即可，非持久主键） */
let messageSeq = 0;
function nextMessageId(): string {
  messageSeq += 1;
  return `msg-${Date.now()}-${messageSeq}`;
}

/** 状态机转移（纯函数）：事件驱动的状态推进规则 */
export function nextState(current: AgentSessionState, event: AgentEvent): AgentSessionState {
  switch (event.kind) {
    case "session_ready":
      return "idle";
    case "message_delta":
    case "message_complete":
    case "tool_use":
    case "tool_result":
      return current === "waiting_input" ? current : "thinking";
    case "permission_request":
    case "question_request":
      return "waiting_input";
    case "state_changed":
      return event.state;
    case "turn_ended":
      return "idle";
    case "error":
      return "error";
    case "session_ended":
      return "idle";
    default:
      return current;
  }
}

/**
 * 事件归约（纯函数）：返回新消息数组；不修改入参。
 *
 * 文本流去重规则：stream_event 增量与完整 assistant 消息都会到达，
 * message_complete 以「替换当前流式消息文本」收口，两条路径均不重复。
 */
export function applyEventToMessages(messages: ChatMessage[], event: AgentEvent): ChatMessage[] {
  switch (event.kind) {
    case "message_delta": {
      const next = [...messages];
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        next[next.length - 1] = { ...last, text: last.text + event.delta };
      } else {
        next.push({
          id: nextMessageId(),
          role: "assistant",
          text: event.delta,
          streaming: true,
          createdAt: Date.now(),
        });
      }
      return next;
    }
    case "message_complete": {
      const next = [...messages];
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        next[next.length - 1] = { ...last, text: event.text, streaming: false };
      } else {
        next.push({
          id: nextMessageId(),
          role: "assistant",
          text: event.text,
          streaming: false,
          createdAt: Date.now(),
        });
      }
      return next;
    }
    case "tool_use": {
      const view: ToolUseView = {
        toolUseId: event.toolUseId,
        name: event.name,
        input: event.input,
      };
      const next = [...messages];
      const last = next[next.length - 1];
      // 挂到同轮的 AI 消息上；没有可挂的（如纯工具轮）则新开一条
      if (last && last.role === "assistant") {
        next[next.length - 1] = {
          ...last,
          streaming: false,
          toolUses: [...(last.toolUses ?? []), view],
        };
      } else {
        next.push({
          id: nextMessageId(),
          role: "assistant",
          text: "",
          streaming: false,
          createdAt: Date.now(),
          toolUses: [view],
        });
      }
      return next;
    }
    case "tool_result": {
      // 反向查找最近的同 id 工具卡片回填结果
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        const msg = messages[i];
        const idx = msg.toolUses?.findIndex((t) => t.toolUseId === event.toolUseId) ?? -1;
        if (idx >= 0 && msg.toolUses) {
          const toolUses = [...msg.toolUses];
          toolUses[idx] = {
            ...toolUses[idx],
            resultContent: event.content,
            isError: event.isError,
          };
          const next = [...messages];
          next[i] = { ...msg, toolUses };
          return next;
        }
      }
      return messages;
    }
    case "turn_ended": {
      if (messages.length === 0) return messages;
      const next = [...messages];
      const last = next[next.length - 1];
      // 用量挂轮末消息；流式未收口时在此强制收口（协议缺 complete 的容错）
      if (last.role === "assistant") {
        next[next.length - 1] = { ...last, streaming: false, usage: event.usage };
      }
      return next;
    }
    case "error": {
      return [
        ...messages,
        {
          id: nextMessageId(),
          role: "assistant",
          text: event.message,
          streaming: false,
          createdAt: Date.now(),
          error: true,
        },
      ];
    }
    default:
      return messages;
  }
}

/** 权限请求归一为待答视图（纯函数） */
export function toPermissionView(event: AgentEvent): PermissionRequestView | null {
  if (event.kind !== "permission_request") return null;
  return {
    requestId: event.requestId,
    toolName: event.toolName,
    input: event.input,
    answered: null,
  };
}

/**
 * AskUserQuestion 的 input 宽容解析为问题视图（纯函数）。
 *
 * 官方输入形态：{questions:[{question,header,options:[{label,description}],multiSelect}]}。
 * 逐层探测 + 逐项兜底：CLI 版本演进加字段/改可选性时不抛错，
 * 无法识别任何问题时返回 null（调用方按普通 tool_use 兜底渲染）。
 */
export function toQuestionView(event: AgentEvent): QuestionRequestView | null {
  if (event.kind !== "question_request") return null;
  const raw = event.input as { questions?: unknown[] } | null;
  const rawQuestions = Array.isArray(raw?.questions) ? (raw?.questions as Record<string, unknown>[]) : [];
  const questions: QuestionItemView[] = rawQuestions
    .map((q) => {
      const rawOptions = Array.isArray(q.options) ? (q.options as Record<string, unknown>[]) : [];
      return {
        question: typeof q.question === "string" ? q.question : "",
        header: typeof q.header === "string" ? q.header : undefined,
        multiSelect: q.multiSelect === true,
        options: rawOptions
          .map((o) => ({
            label: typeof o.label === "string" ? o.label : String(o),
            description: typeof o.description === "string" ? o.description : undefined,
          }))
          .filter((o) => o.label.length > 0),
      };
    })
    .filter((q) => q.question.length > 0);
  if (questions.length === 0) return null;
  return { toolUseId: event.toolUseId, questions };
}

interface AgentStoreState {
  /** 每会话状态机 */
  states: Record<string, AgentSessionState>;
  /** 每会话消息列表 */
  messages: Record<string, ChatMessage[]>;
  /** 每会话待答权限卡（无卡为 undefined；已答卡由 T5 固化进消息流） */
  pendingPermissions: Record<string, PermissionRequestView>;
  /** 每会话待答问题卡（AskUserQuestion；解析失败不生成） */
  pendingQuestions: Record<string, QuestionRequestView>;
  /** 子进程存活标志（区分 states 残留与真实进程；切视图 suspend 后为 false） */
  running: Record<string, boolean>;
  /** 事件监听是否已建立（应用级一次） */
  listenerBound: boolean;

  /** 绑定应用级事件监听（ChatView 挂载时调用一次） */
  bindListener: () => Promise<() => void>;
  /** 应用一条后端事件（listener 回调入口） */
  applyAgentEvent: (sessionId: string, event: AgentEvent) => void;
  /** 启动智能体会话 */
  start: (params: Parameters<typeof agentSessionStart>[0]) => Promise<void>;
  /** 发送用户消息（先乐观入列再 invoke） */
  send: (sessionId: string, text: string) => Promise<void>;
  /** 中断当前生成 */
  interrupt: (sessionId: string) => Promise<void>;
  /** 杀进程但保留消息/状态（切到终端视图用；回来时按 --resume 续聊） */
  suspend: (sessionId: string) => Promise<void>;
  /** 停止会话并清空本会话状态 */
  stop: (sessionId: string) => Promise<void>;
  /** 会话视图卸载时清理（进程生命周期由 stop 管理，本接口只清前端态） */
  clearSession: (sessionId: string) => void;
  /** 应答权限卡：control_response 回写 + 本地固化 */
  answerPermission: (sessionId: string, requestId: string, allow: boolean) => Promise<void>;
  /** 应答问题卡：tool_result 回写 + 答案入消息流 */
  answerQuestion: (sessionId: string, toolUseId: string, answerText: string) => Promise<void>;
}

export const useAgentStore = create<AgentStoreState>((set, get) => ({
  states: {},
  messages: {},
  pendingPermissions: {},
  pendingQuestions: {},
  running: {},
  listenerBound: false,

  bindListener: async () => {
    if (get().listenerBound) {
      // 已绑定：返回空清理函数，调用方无需感知是否首个
      return () => undefined;
    }
    set({ listenerBound: true });
    const unlistenMessage = listen<AgentEventPayload>("agent:message", (e) => {
      get().applyAgentEvent(e.payload.sessionId, e.payload.event);
    });
    const unlistenState = listen<AgentEventPayload>("agent:state", (e) => {
      get().applyAgentEvent(e.payload.sessionId, e.payload.event);
    });
    try {
      const [un1, un2] = await Promise.all([unlistenMessage, unlistenState]);
      return () => {
        set({ listenerBound: false });
        un1();
        un2();
      };
    } catch {
      // 非 Tauri 运行时（浏览器预览台）listen 不可用：复位标记并静默降级为空监听
      set({ listenerBound: false });
      return () => undefined;
    }
  },

  applyAgentEvent: (sessionId, event) => {
    set((s) => {
      const prevMessages = s.messages[sessionId] ?? [];
      const permission = toPermissionView(event);
      const question = toQuestionView(event);
      return {
        states: {
          ...s.states,
          [sessionId]: nextState(s.states[sessionId] ?? "starting", event),
        },
        messages: {
          ...s.messages,
          [sessionId]: applyEventToMessages(prevMessages, event),
        },
        running: {
          ...s.running,
          // 子进程退出即失活（重复的 session_ended 幂等）
          [sessionId]: event.kind === "session_ended" ? false : s.running[sessionId] ?? true,
        },
        ...(permission
          ? {
              pendingPermissions: {
                ...s.pendingPermissions,
                [sessionId]: permission,
              },
            }
          : {}),
        ...(question
          ? {
              pendingQuestions: {
                ...s.pendingQuestions,
                [sessionId]: question,
              },
            }
          : {}),
      };
    });
    // 子进程退出联动 appStore 运行态（与 pty:exit → TerminalView 同步语义对齐）
    if (event.kind === "session_ended") {
      useAppStore.getState().updateSession(sessionId, { isRunning: false, closedAt: Date.now() }).catch(() => {});
    }
  },

  start: async (params) => {
    set((s) => ({
      states: { ...s.states, [params.sessionId]: "starting" },
      messages: { ...s.messages, [params.sessionId]: s.messages[params.sessionId] ?? [] },
      running: { ...s.running, [params.sessionId]: true },
    }));
    try {
      await agentSessionStart(params);
    } catch (e) {
      // 启动失败回滚运行标志并透传错误（openTab/切换层据此提示）
      set((s) => ({ ...s, running: { ...s.running, [params.sessionId]: false } }));
      throw e;
    }
  },

  send: async (sessionId, text) => {
    // 乐观入列：用户消息立即上屏；发送失败把该条标红（design doc §6 失败形态）
    const localId = nextMessageId();
    set((s) => ({
      messages: {
        ...s.messages,
        [sessionId]: [
          ...(s.messages[sessionId] ?? []),
          {
            id: localId,
            role: "user" as const,
            text,
            streaming: false,
            createdAt: Date.now(),
          },
        ],
      },
    }));
    try {
      await agentSend(sessionId, text);
    } catch {
      set((s) => {
        const list = s.messages[sessionId];
        if (!list) return s;
        return {
          ...s,
          messages: {
            ...s.messages,
            [sessionId]: list.map((m) =>
              m.id === localId ? { ...m, error: true } : m,
            ),
          },
        };
      });
    }
  },

  interrupt: async (sessionId) => {
    await agentInterrupt(sessionId);
  },

  suspend: async (sessionId) => {
    set((s) => ({ ...s, running: { ...s.running, [sessionId]: false } }));
    await agentSessionStop(sessionId).catch(() => {
      // 进程已退出（session_ended 先到）时 stop 报会话不存在——预期内，吞掉
    });
  },

  stop: async (sessionId) => {
    await get().suspend(sessionId);
    get().clearSession(sessionId);
  },

  clearSession: (sessionId) => {
    set((s) => {
      const { [sessionId]: _dropState, ...restStates } = s.states;
      const { [sessionId]: _dropMsgs, ...restMessages } = s.messages;
      const { [sessionId]: _dropPerm, ...restPerms } = s.pendingPermissions;
      const { [sessionId]: _dropQ, ...restQs } = s.pendingQuestions;
      const { [sessionId]: _dropRun, ...restRunning } = s.running;
      void _dropState;
      void _dropMsgs;
      void _dropPerm;
      void _dropQ;
      void _dropRun;
      return {
        states: restStates,
        messages: restMessages,
        pendingPermissions: restPerms,
        pendingQuestions: restQs,
        running: restRunning,
      };
    });
  },

  answerPermission: async (sessionId, requestId, allow) => {
    const pending = get().pendingPermissions[sessionId];
    if (!pending || pending.requestId !== requestId) return;
    // 先清卡再回写：CLI 应答后会立即恢复事件流，避免旧卡闪现
    set((s) => {
      const { [sessionId]: _drop, ...rest } = s.pendingPermissions;
      void _drop;
      return { ...s, pendingPermissions: rest };
    });
    try {
      await agentRespondPermission(sessionId, requestId, allow);
      // 固化应答记录进消息流（工具卡片形态）
      set((s) => ({
        ...s,
        messages: {
          ...s.messages,
          [sessionId]: [
            ...(s.messages[sessionId] ?? []),
            {
              id: nextMessageId(),
              role: "assistant" as const,
              text: "",
              streaming: false,
              createdAt: Date.now(),
              toolUses: [
                {
                  toolUseId: pending.requestId,
                  name: pending.toolName,
                  input: pending.input,
                  resultContent: allow ? i18n.t("chat.allowed") : i18n.t("chat.denied"),
                },
              ],
            },
          ],
        },
      }));
    } catch {
      // 回写失败：恢复待答卡让用户重试（进程可能已退出，重复点会再报）
      set((s) => ({
        ...s,
        pendingPermissions: { ...s.pendingPermissions, [sessionId]: pending },
      }));
    }
  },

  answerQuestion: async (sessionId, toolUseId, answerText) => {
    set((s) => {
      const { [sessionId]: _drop, ...rest } = s.pendingQuestions;
      void _drop;
      return { ...s, pendingQuestions: rest };
    });
    try {
      await agentAnswerQuestion(sessionId, toolUseId, answerText);
      // 答案以用户气泡入流，用户可回看自己的选择
      set((s) => ({
        ...s,
        messages: {
          ...s.messages,
          [sessionId]: [
            ...(s.messages[sessionId] ?? []),
            {
              id: nextMessageId(),
              role: "user" as const,
              text: answerText,
              streaming: false,
              createdAt: Date.now(),
            },
          ],
        },
      }));
    } catch {
      // 回写失败不下沉：答案文本已保留在消息流，用户可手动重发
    }
  },
}));
