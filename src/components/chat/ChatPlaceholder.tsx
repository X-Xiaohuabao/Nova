/**
 * 聊天视图挂载点占位（智能体统一接入特性预留）。
 *
 * 仅渲染空态；真正的聊天 UI 与 agent:* 事件对接由独立立项实现。
 * 挂载方式：作为 WindowFrame 内容区 children 传入。文案走 i18n。
 */

import { useTranslation } from "react-i18next";

export default function ChatPlaceholder() {
  const { t } = useTranslation();

  return (
    <main className="placeholder-in flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card shadow-sm text-muted-foreground">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </div>
      <p className="text-[13px] font-medium text-foreground/85">{t("chat.title")}</p>
      <p className="text-xs text-muted-foreground/70">{t("chat.desc")}</p>
    </main>
  );
}
