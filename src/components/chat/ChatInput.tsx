/**
 * 聊天输入区（design doc §6）：多行自适应（1~8 行）、Enter 发送 / Shift+Enter 换行、
 * IME 组合中 Enter 不发送；流式中发送钮变停止钮，Esc 停止生成。
 * waiting_input 态顶部黄条提示（design doc §7）。
 */

import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, LoaderCircle, Square, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentSessionState } from "@/types";

/** 8 行高度上限（超出内部滚动），行高按 13px 正文 × 1.6 估算再加内边距余量 */
const MAX_INPUT_HEIGHT = 8 * 22 + 16;

interface ChatInputProps {
  state: AgentSessionState;
  disabled?: boolean;
  /** 受控草稿（空态示例回填用），由父层持有以在视图切换间保留 */
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
}

export default function ChatInput({
  state,
  disabled = false,
  draft,
  onDraftChange,
  onSend,
  onStop,
}: ChatInputProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const generating = state === "thinking" || state === "starting";

  /** 高度自适应：先复位再按内容撑开，封顶后内部滚动 */
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_INPUT_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [draft, resize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Esc = 停止生成（design doc §6）；IME 组合中的 Esc 属于取消候选，不拦截
    if (e.key === "Escape" && generating && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onStop();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const text = draft.trim();
      if (text && !disabled) onSend(text);
    }
  };

  const canSend = draft.trim().length > 0 && !disabled && !generating;

  return (
    <div className="border-t border-border bg-background px-4 pb-3 pt-2">
      {state === "waiting_input" && (
        <div className="mx-auto mb-2 flex w-full max-w-[720px] items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2.5 py-1.5 text-xs text-foreground/80">
          <TriangleAlert size={13} strokeWidth={2} className="shrink-0 text-primary" />
          {t("chat.waitingBanner")}
        </div>
      )}
      <div
        className={cn(
          "mx-auto flex w-full max-w-[720px] items-end gap-2 rounded-xl border bg-card px-3 py-2 transition-shadow",
          state === "waiting_input" ? "border-primary shadow-[0_0_0_2px_var(--ring)]" : "border-border",
        )}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          disabled={disabled}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={t("chat.inputPlaceholder")}
          aria-label={t("chat.inputPlaceholder")}
          className="max-h-[192px] min-h-[22px] flex-1 resize-none bg-transparent text-[13px] leading-[1.6] text-foreground outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
        />
        {generating ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={t("chat.stop")}
            title={t("chat.stop")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive text-white transition-transform active:scale-[0.95]"
          >
            {state === "starting" ? (
              <LoaderCircle size={13} strokeWidth={2} className="animate-spin" />
            ) : (
              <Square size={12} strokeWidth={2.5} fill="currentColor" />
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={!canSend}
            onClick={() => {
              const text = draft.trim();
              if (text) onSend(text);
            }}
            aria-label={t("chat.send")}
            title={t("chat.send")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all active:scale-[0.95] disabled:opacity-40"
          >
            <ArrowUp size={14} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
