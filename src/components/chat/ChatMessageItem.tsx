/**
 * 单条聊天消息（design doc §3 非对称形态）：
 * 用户 = 右对齐气泡（primary 10% 底、右上 4px 收角、max-w 75%）；
 * AI = 全宽左对齐，头部工具图标 + 名 caption，正文 Markdown；
 * 工具调用折叠卡片（collapsed pill，点击展开参数/结果——V2 完整态，此处轻量版）。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, LoaderCircle, Terminal } from "lucide-react";
import type { ChatMessage, ToolType, ToolUseView } from "@/types";
import { toolVisual } from "@/components/tabs/tabVisuals";
import { MarkdownBody } from "@/components/markdown/MarkdownBody";
import { cn } from "@/lib/utils";

/** 工具卡片关键词高亮的空集（聊天消息无搜索态，模块级常量保引用） */
const NO_TOKENS: readonly string[] = [];

interface ToolPillProps {
  view: ToolUseView;
}

function ToolPill({ view }: ToolPillProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const done = view.resultContent !== undefined;
  const failed = view.isError === true;

  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-foreground/80 transition-colors hover:bg-accent"
      >
        <ChevronRight
          size={12}
          strokeWidth={2}
          className={cn("shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <Terminal size={12} strokeWidth={2} className="shrink-0 text-muted-foreground" />
        <span className="font-mono">{view.name}</span>
        <span className="ml-auto flex items-center gap-1 text-[11px]">
          {failed ? (
            <span className="text-destructive">{t("chat.toolFailed")}</span>
          ) : done ? (
            <span className="text-muted-foreground">{t("chat.toolDone")}</span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <LoaderCircle size={11} strokeWidth={2} className="animate-spin" />
              {t("chat.toolRunning")}
            </span>
          )}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-2.5 py-2 text-xs">
          <div className="mb-1 font-medium text-muted-foreground">{t("chat.toolParams")}</div>
          <pre className="mb-2 max-h-40 overflow-auto rounded bg-secondary/60 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
            {safeFormat(view.input)}
          </pre>
          {view.resultContent !== undefined && (
            <>
              <div className="mb-1 font-medium text-muted-foreground">{t("chat.toolResult")}</div>
              <pre
                className={cn(
                  "max-h-48 overflow-auto rounded p-2 font-mono text-[11px] leading-relaxed",
                  failed ? "bg-destructive/10 text-destructive" : "bg-secondary/60 text-foreground/80",
                )}
              >
                {view.resultContent || "—"}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 工具参数安全格式化：未知结构兜底为 String()，不让渲染抛错 */
function safeFormat(input: unknown): string {
  if (input === null || input === undefined) return "—";
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2) ?? "—";
  } catch {
    return String(input);
  }
}

interface ChatMessageItemProps {
  message: ChatMessage;
  toolType: ToolType;
  /** 工具名（AI 消息头部 caption） */
  toolLabel: string;
  /** 失败用户气泡的重试回调（design doc §6：标红左边条 + [重试]） */
  onRetry?: (text: string) => void;
}

export default function ChatMessageItem({ message, toolType, toolLabel, onRetry }: ChatMessageItemProps) {
  const { t } = useTranslation();
  const { Icon, color } = toolVisual(toolType);

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div
          className={cn(
            "max-w-[70%] rounded-xl rounded-tr-sm px-3 py-2 text-[13px] leading-relaxed",
            message.error
              ? "border-l-[3px] border-destructive bg-primary/10 text-foreground"
              : "bg-primary/10 text-foreground",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        </div>
        {message.error && (
          <div className="flex items-center gap-1.5 text-[11px] text-destructive">
            {t("chat.sendFailed")}
            {onRetry && (
              <button
                type="button"
                onClick={() => onRetry(message.text)}
                className="rounded border border-border px-1.5 py-0.5 font-medium transition-colors hover:bg-accent"
              >
                {t("chat.retry")}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="placeholder-in">
      <div className="mb-1 flex items-center gap-1.5">
        <span style={{ color }}>
          <Icon size={14} strokeWidth={2} />
        </span>
        <span className="text-[11px] text-muted-foreground">{toolLabel}</span>
        {message.streaming && (
          <span className="text-[11px] text-muted-foreground/70">…</span>
        )}
      </div>
      {(message.text || message.streaming) && !message.error && (
        <div className="text-[13px] leading-relaxed text-foreground">
          <MarkdownBody text={message.text} tokens={NO_TOKENS} />
          {message.streaming && (
            <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-primary motion-safe:animate-pulse" />
          )}
        </div>
      )}
      {message.toolUses?.map((view) => (
        <ToolPill key={view.toolUseId} view={view} />
      ))}
      {message.error && (
        <div className="mt-1 rounded-lg border-l-[3px] border-destructive bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {message.text}
        </div>
      )}
    </div>
  );
}
