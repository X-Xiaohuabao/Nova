/**
 * 聊天视图主体（design doc §2/§4）：消息流唯一滚动区（720px 居中）+ 吸底输入区。
 *
 * 滚动跟随策略：贴底渲染时逐次跟随到底；用户上滚离底超过 48px 即暂停跟随，
 * 出现「回到底部」浮动按钮；消息变化时仅在跟随态滚底。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown } from "lucide-react";
import type { ToolType } from "@/types";
import { TOOL_DISPLAY_NAMES } from "@/types";
import { useAgentStore } from "@/stores/agentStore";
import ChatMessageItem from "./ChatMessageItem";
import ChatInput from "./ChatInput";
import ChatEmptyState from "./ChatEmptyState";

/** 消息列表空数组的模块级常量（selector 稳定引用，避免无谓重渲染） */
const NO_MESSAGES: never[] = [];

/** 用户上滚超过该距离即暂停自动跟随（design doc §4） */
const FOLLOW_THRESHOLD_PX = 48;

interface ChatViewProps {
  sessionId: string;
  /** 会话工具类型（AI 消息头部标识）；T6 挂接后由会话数据传入 */
  toolType?: ToolType;
}

export default function ChatView({ sessionId, toolType = "claude" }: ChatViewProps) {
  const { t } = useTranslation();
  const messages = useAgentStore((s) => s.messages[sessionId] ?? NO_MESSAGES);
  const state = useAgentStore((s) => s.states[sessionId] ?? "starting");
  const bindListener = useAgentStore((s) => s.bindListener);
  const send = useAgentStore((s) => s.send);
  const interrupt = useAgentStore((s) => s.interrupt);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);
  const [draft, setDraft] = useState("");

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

  const handleStop = useCallback(() => {
    void interrupt(sessionId);
  }, [interrupt, sessionId]);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto px-4 py-4"
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
            <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5 pb-2">
              {messages.map((message) => (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  toolType={toolType}
                  toolLabel={TOOL_DISPLAY_NAMES[toolType] ?? toolType}
                />
              ))}
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
      <ChatInput
        state={state}
        draft={draft}
        onDraftChange={setDraft}
        onSend={handleSend}
        onStop={handleStop}
      />
    </main>
  );
}
