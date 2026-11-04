/**
 * 聊天视图主体（design doc §2/§4）：消息流唯一滚动区（720px 居中）+ 吸底输入区。
 *
 * 滚动跟随策略：贴底渲染时逐次跟随到底；用户上滚离底超过 48px 即暂停跟随，
 * 出现「回到底部」浮动按钮；消息变化时仅在跟随态滚底。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowDown } from "lucide-react";
import type { ChatMessage, SlashCommand, ToolType } from "@/types";
import { TOOL_DISPLAY_NAMES } from "@/types";
import { useAgentStore } from "@/stores/agentStore";
import { useAppStore } from "@/stores/appStore";
import { agentListCommands, getSessionCost, writeClipboardText } from "@/utils/ipc";
import ChatMessageItem from "./ChatMessageItem";
import ChatInput from "./ChatInput";
import ChatEmptyState from "./ChatEmptyState";
import { PermissionCard, QuestionCard } from "./ChatCards";

/** 消息列表空数组的模块级常量（selector 稳定引用，避免无谓重渲染） */
const NO_MESSAGES: never[] = [];

/** 用户上滚超过该距离即暂停自动跟随（design doc §4） */
const FOLLOW_THRESHOLD_PX = 48;

/** 对话导出为 Markdown（/export）：用户/AI 消息按序输出，工具调用以引用块附录 */
function messagesToMarkdown(messages: ChatMessage[], aiLabel: string): string {
  const blocks = messages.map((m) => {
    if (m.role === "user") {
      return `## 🧑 用户\n\n${m.text}`;
    }
    const tools = (m.toolUses ?? [])
      .map((tu) => `> 🔧 \`${tu.name}\`${tu.resultContent ? ` → ${tu.resultContent.slice(0, 120)}` : ""}`)
      .join("\n>\n");
    const parts = [m.text && `## 🤖 ${aiLabel}\n\n${m.text}`, tools && `**工具调用**\n\n${tools}`].filter(Boolean);
    return parts.join("\n\n") || `## 🤖 ${aiLabel}\n\n（仅工具调用，无文本）`;
  });
  return `# Nova 对话导出\n\n${blocks.join("\n\n---\n\n")}\n`;
}

interface ChatViewProps {
  sessionId: string;
  /** 会话工具类型（AI 消息头部标识）；T6 挂接后由会话数据传入 */
  toolType?: ToolType;
}

export default function ChatView({ sessionId, toolType = "claude" }: ChatViewProps) {
  const { t } = useTranslation();
  const messages = useAgentStore((s) => s.messages[sessionId] ?? NO_MESSAGES);
  const state = useAgentStore((s) => s.states[sessionId] ?? "starting");
  const pendingPermission = useAgentStore((s) => s.pendingPermissions[sessionId]);
  const pendingQuestion = useAgentStore((s) => s.pendingQuestions[sessionId]);
  const bindListener = useAgentStore((s) => s.bindListener);
  const send = useAgentStore((s) => s.send);
  const interrupt = useAgentStore((s) => s.interrupt);
  const answerPermission = useAgentStore((s) => s.answerPermission);
  const answerQuestion = useAgentStore((s) => s.answerQuestion);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const [draft, setDraft] = useState("");
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);

  // 斜杠命令源：按会话工作目录加载（项目级命令就近生效）；加载失败按空集（面板不弹）
  const workDir = useAppStore((s) => {
    const session = s.sessions.find((x) => x.id === sessionId);
    return s.projects.find((p) => p.id === session?.projectId)?.path ?? "~";
  });
  useEffect(() => {
    let disposed = false;
    agentListCommands(workDir)
      .then((cmds) => {
        if (!disposed) setSlashCommands(cmds);
      })
      .catch(() => {
        // 命令面板是增强能力，不阻塞聊天
      });
    return () => {
      disposed = true;
    };
  }, [workDir]);

  // 应用级事件监听：首个 ChatView 挂载时绑定，卸载时解绑
  useEffect(() => {
    let disposed = false;
    let unbind: (() => void) | undefined;
    void bindListener().then((fn) => {
      if (disposed) fn();
      else unbind = fn;
    });
    return () => {
      disposed = true;
      unbind?.();
    };
  }, [bindListener]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // 消息变化时跟随滚底（流式增量高频触发，auto 保证不抖）
  useEffect(() => {
    if (followingRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const now = distance <= FOLLOW_THRESHOLD_PX;
    if (now !== followingRef.current) {
      followingRef.current = now;
      setFollowing(now);
    }
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      setDraft("");
      void send(sessionId, text);
    },
    [send, sessionId],
  );

  /** AI 消息头部标识（导出与消息渲染共用） */
  const toolLabel = TOOL_DISPLAY_NAMES[toolType] ?? toolType;

  /** 斜杠命令执行分治：Nova 本地动作 / prompt 展开发送（/clear /model /help 见各自分支） */
  const handleExecuteCommand = useCallback(
    (cmd: SlashCommand, args: string) => {
      setDraft("");
      if (cmd.source === "builtin_nova") {
        if (cmd.name === "clear") {
          void useAppStore.getState().agentRestartChannel(sessionId, true);
          toast.success(t("chat.cmdCleared"));
          return;
        }
        if (cmd.name === "model") {
          useAppStore.getState().setEditSessionModalOpen(true, sessionId);
          return;
        }
        if (cmd.name === "cost") {
          void getSessionCost(sessionId)
            .then((c) => {
              if (!c) {
                toast.info(t("chat.cmdCostEmpty"));
                return;
              }
              toast.info(
                t("chat.cmdCost", {
                  input: (c.inputTokens / 1000).toFixed(1),
                  output: (c.outputTokens / 1000).toFixed(1),
                  cost: (c.costUsd ?? 0).toFixed(3),
                }),
              );
            })
            .catch(() => toast.error(t("chat.cmdCostFailed")));
          return;
        }
        if (cmd.name === "export") {
          const md = messagesToMarkdown(messages, toolLabel);
          void writeClipboardText(md)
            .then(() => toast.success(t("chat.cmdExported")))
            .catch(() => toast.error(t("chat.cmdExportFailed")));
          return;
        }
        if (cmd.name === "help") {
          toast.info(t("chat.cmdHelp"));
          return;
        }
        return;
      }
      // prompt 模板型（自定义命令）：展开 $ARGUMENTS；Skills 以「使用技能」形态发送
      const text = cmd.prompt
        ? cmd.prompt.split("$ARGUMENTS").join(args)
        : t("chat.cmdSkillInvoke", { name: cmd.name, description: cmd.description ?? "", args });
      handleSend(text);
    },
    [handleSend, sessionId, t, messages, toolLabel],
  );

  // 尾部已有流式 AI 消息时不再显示思考占位（光标即活动指示）
  const isTailStreaming =
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant" &&
    messages[messages.length - 1].streaming;

  const handleStop = useCallback(() => {
    void interrupt(sessionId);
  }, [interrupt, sessionId]);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-6 py-4"
          role="log"
          aria-live="polite"
          aria-label={t("chat.streamLabel")}
        >
          {messages.length === 0 ? (
            <ChatEmptyState
              toolType={toolType}
              onPick={(text) => setDraft(text)}
            />
          ) : (
            <div className="flex w-full flex-col gap-5 pb-2">
              {messages.map((message) => (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  toolType={toolType}
                  toolLabel={toolLabel}
                  onRetry={handleSend}
                />
              ))}
              {(state === "starting" || state === "thinking") && !isTailStreaming && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-0.5">
                    <span className="thinking-dot h-1 w-1 rounded-full bg-foreground/60" />
                    <span className="thinking-dot h-1 w-1 rounded-full bg-foreground/60" />
                    <span className="thinking-dot h-1 w-1 rounded-full bg-foreground/60" />
                  </span>
                  {state === "starting" ? t("chat.connecting") : t("chat.thinking")}
                </div>
              )}
            </div>
          )}
        </div>
        {!following && messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              followingRef.current = true;
              setFollowing(true);
              scrollToBottom(true);
            }}
            aria-label={t("chat.backToBottom")}
            title={t("chat.backToBottom")}
            className="absolute bottom-3 left-1/2 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-popover text-foreground/80 shadow-md transition-transform hover:text-foreground active:scale-[0.95]"
          >
            <ArrowDown size={14} strokeWidth={2} />
          </button>
        )}
      </div>
      {(pendingPermission || pendingQuestion) && (
        <div className="px-6 pb-2">
          {pendingPermission && (
            <PermissionCard
              view={pendingPermission}
              onAnswer={(allow) => {
                void answerPermission(sessionId, pendingPermission.requestId, allow);
              }}
            />
          )}
          {pendingQuestion && (
            <QuestionCard
              view={pendingQuestion}
              onAnswer={(text) => {
                void answerQuestion(sessionId, pendingQuestion.toolUseId, text);
              }}
            />
          )}
        </div>
      )}
      <ChatInput
        state={state}
        draft={draft}
        onDraftChange={setDraft}
        onSend={handleSend}
        onStop={handleStop}
        slashCommands={slashCommands}
        onExecuteCommand={handleExecuteCommand}
      />
    </main>
  );
}
