/**
 * macOS 风格底部状态条外壳。
 *
 * 毛玻璃表面 + 细顶边框；左侧运行状态占位，右侧显示当前运行时与桥接通道
 * （tauri-desktop → Tauri IPC / web-remote → WebSocket），直观呈现桥接层生效。
 * 文案走 i18n。
 */

import { useTranslation } from "react-i18next";
import type { RuntimeKind } from "@/lib/bridge";
import { runtimeKind } from "@/lib/bridge";

interface StatusBarShellProps {
  /** 左侧状态文本 */
  leftText?: string;
  /** 右侧状态文本；缺省显示运行时与桥接通道 */
  rightText?: string;
  /** 运行时形态；缺省自动检测（预览页应由 WindowFrame 覆盖传入） */
  runtime?: RuntimeKind;
}

export default function StatusBarShell({
  leftText,
  rightText,
  runtime,
}: StatusBarShellProps) {
  const { t } = useTranslation();
  const kind = runtime ?? runtimeKind();
  const left = leftText ?? t("shell.ready");
  const right = rightText ?? `TeaCoder · ${t(kind === "tauri-desktop" ? "shell.bridgeTauri" : "shell.bridgeWs")}`;

  return (
    <footer
      className="surface-blur flex h-7 flex-shrink-0 items-center justify-between border-t border-border/60 px-3 text-[11px] text-muted-foreground"
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="running-dot h-1.5 w-1.5 rounded-full bg-green-500" />
        {left}
      </span>
      <span className="flex items-center gap-2">
        <span
          className={`rounded-sm px-1.5 py-px text-[10px] font-medium ${
            kind === "tauri-desktop"
              ? "bg-primary/10 text-primary"
              : "bg-orange-500/10 text-orange-600 dark:text-orange-400"
          }`}
        >
          {kind}
        </span>
        {right}
      </span>
    </footer>
  );
}
