/**
 * 键位录制输入（新骨架）。
 *
 * 点击进入录制态，捕获首个含主修饰键的组合即提交（存储统一 "Ctrl+..." 规范），
 * 显示一律走 formatShortcut 平台化。
 */

import { useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatShortcut } from "@/lib/shortcut";
import { cn } from "@/lib/utils";

interface KeyCaptureInputProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

const MODIFIER_KEYS = ["Control", "Shift", "Alt", "Meta", "Escape"];

export default function KeyCaptureInput({ value, onChange, ariaLabel }: KeyCaptureInputProps) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(false);
      return;
    }
    if (MODIFIER_KEYS.includes(event.key)) return;

    // 存储规范：主修饰键统一记为 Ctrl（显示层再按平台转换）
    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
    if (event.shiftKey) parts.push("Shift");
    if (event.altKey) parts.push("Alt");
    parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
    onChange(parts.join("+"));
    setRecording(false);
  };

  return (
    <div
      ref={boxRef}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onKeyDown={recording ? handleKeyDown : undefined}
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      className={cn(
        "inline-flex h-7 min-w-32 cursor-pointer items-center justify-center rounded-md border px-2 text-xs transition-colors",
        recording
          ? "border-primary bg-primary/10 text-foreground"
          : "border-input bg-background text-foreground/85 hover:border-ring",
      )}
    >
      {recording ? (
        <span className="text-muted-foreground">{t("settings.keybindings.recording")}</span>
      ) : (
        <kbd className="font-mono text-[11px]">{formatShortcut(value)}</kbd>
      )}
    </div>
  );
}
