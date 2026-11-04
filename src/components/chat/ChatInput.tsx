/**
 * 聊天输入区（design doc §6）：多行自适应（1~8 行）、Enter 发送 / Shift+Enter 换行、
 * IME 组合中 Enter 不发送；流式中发送钮变停止钮，Esc 停止生成。
 * waiting_input 态顶部黄条提示（design doc §7）。
 * draft 以 `/` 开头时上方弹出斜杠命令面板（键盘导航在本组件拦截转发）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, Square, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentSessionState, SlashCommand } from "@/types";
import SlashCommandPanel from "./SlashCommandPanel";

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
  /** `/` 面板命令源（ChatView 按会话工作目录加载） */
  slashCommands?: SlashCommand[];
  /** 命令执行（分治语义在 ChatView：本地动作 / prompt 展开） */
  onExecuteCommand?: (cmd: SlashCommand, args: string) => void;
}

export default function ChatInput({
  state,
  disabled = false,
  draft,
  onDraftChange,
  onSend,
  onStop,
  slashCommands = [],
  onExecuteCommand,
}: ChatInputProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // 仅 thinking 锁发送：CLI 的 stream-json 双向模式是「消息驱动初始化」——
  // 首条 user 消息到达前不会发 system/init，starting 态必须允许用户输入，
  // 否则 UI 等 init、CLI 等消息，互相死锁。
  const generating = state === "thinking";

  /** 斜杠面板：命令段/参数段拆分与匹配（draft 变化即重算，索引复位） */
  const slashActive = draft.startsWith("/") && slashCommands.length > 0 && !!onExecuteCommand;
  const slashBody = slashActive ? draft.slice(1) : "";
  const spaceIdx = slashBody.indexOf(" ");
  const slashFilter = spaceIdx >= 0 ? slashBody.slice(0, spaceIdx) : slashBody;
  const slashArgs = spaceIdx >= 0 ? slashBody.slice(spaceIdx + 1).trim() : "";
  const matchedCommands = useMemo(
    () => slashCommands.filter((c) => c.name.startsWith(slashFilter)),
    [slashCommands, slashFilter],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
  }, [slashFilter]);

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
    // 斜杠面板打开时优先服务面板导航（焦点保持输入框，事件在此转发）
    if (slashActive && matchedCommands.length > 0 && !e.nativeEvent.isComposing) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % matchedCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + matchedCommands.length) % matchedCommands.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        onExecuteCommand?.(matchedCommands[activeIndex], slashArgs);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onDraftChange("");
        return;
      }
    }
    // Esc = 停止生成（design doc §6）；IME 组合中的 Esc 属于取消候选，不拦截
    if (e.key === "Escape" && generating && !e.nativeEvent.isComposing) {
      e.preventDefault();
      onStop();
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      const text = draft.trim();
      // 与发送按钮 disabled 语义对齐：starting/thinking 中 Enter 不发送（此时发送钮为停止钮）
      if (text && !disabled && !generating) onSend(text);
    }
  };

  const canSend = draft.trim().length > 0 && !disabled && !generating;

  return (
    <div className="border-t border-border bg-background px-6 pb-3 pt-2">
      {state === "waiting_input" && (
        <div className="mb-2 flex w-full items-center gap-1.5 rounded-md border border-border bg-secondary/60 px-2.5 py-1.5 text-xs text-foreground/80">
          <TriangleAlert size={13} strokeWidth={2} className="shrink-0 text-primary" />
          {t("chat.waitingBanner")}
        </div>
      )}
      <div className="relative w-full">
        {slashActive && (
          <SlashCommandPanel
            commands={slashCommands}
            filter={slashFilter}
            activeIndex={activeIndex}
            args={slashArgs}
            onExecute={(cmd, args) => onExecuteCommand?.(cmd, args)}
          />
        )}
        <div
          className={cn(
            "flex w-full items-end gap-2 rounded-xl border bg-card px-3 py-2 transition-shadow",
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
            <Square size={12} strokeWidth={2.5} fill="currentColor" />
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
    </div>
  );
}
