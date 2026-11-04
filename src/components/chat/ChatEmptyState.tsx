/**
 * 聊天空态（design doc §7 idle）：居中工具图标 + 开始新对话 + 3 个示例问题卡片，
 * 点击示例即填入输入框。
 */

import { useTranslation } from "react-i18next";
import type { ToolType } from "@/types";
import { toolVisual } from "@/components/tabs/tabVisuals";

interface ChatEmptyStateProps {
  toolType: ToolType;
  /** 点击示例问题：回填输入框 */
  onPick: (text: string) => void;
}

export default function ChatEmptyState({ toolType, onPick }: ChatEmptyStateProps) {
  const { t } = useTranslation();
  const { Icon, color } = toolVisual(toolType);
  const examples = ["chat.example1", "chat.example2", "chat.example3"].map((k) => t(k));

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden px-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
        <span style={{ color }}>
          <Icon size={20} strokeWidth={2} />
        </span>
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-[15px] font-medium text-foreground/85">{t("chat.emptyTitle")}</p>
        <p className="text-xs text-muted-foreground/70">{t("chat.emptyDesc")}</p>
      </div>
      <div className="flex w-full max-w-[480px] flex-col gap-2">
        {examples.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => onPick(text)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-left text-[13px] text-foreground/80 transition-colors hover:bg-accent hover:text-foreground active:scale-[0.99] motion-safe:transition-all"
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
