/**
 * 分屏面板外壳（新骨架）。
 *
 * TabBarNext + 内容区插槽：内容由调用方按活动 tab 渲染（终端/聊天/设置等），
 * 缺省渲染会话信息占位。与旧 PaneView 共存迁移（T15 拆除后顶替），
 * 对接同一 appStore 的 panes 状态。文案走 i18n。
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import TabBarNext from "@/components/tabs/TabBarNext";
import { toolVisual } from "@/components/tabs/tabVisuals";

interface PaneViewNextProps {
  paneId: string;
  /** 内容渲染器：给定活动 tabId 渲染内容；缺省渲染占位 */
  renderContent?: (tabId: string | null) => ReactNode;
}

function ContentPlaceholder({ tabId }: { tabId: string | null }) {
  const { t } = useTranslation();
  const session = useAppStore((s) => s.sessions.find((x) => x.id === tabId));

  if (!session) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground/60">
        {t("tabs.emptyPane")}
      </div>
    );
  }

  const visual = toolVisual(session.toolType);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card">
        <visual.Icon size={20} strokeWidth={2} />
      </div>
      <p className="text-[13px] font-medium text-foreground/85">{session.title || "—"}</p>
      <p className="text-[11px] text-muted-foreground/70">{t("tabs.contentPlaceholder")}</p>
    </div>
  );
}

export default function PaneViewNext({ paneId, renderContent }: PaneViewNextProps) {
  const activeTabId = useAppStore(
    (s) => s.panes.find((p) => p.id === paneId)?.activeTabId ?? null,
  );

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <TabBarNext paneId={paneId} />
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        {renderContent ? renderContent(activeTabId) : <ContentPlaceholder tabId={activeTabId} />}
      </div>
    </section>
  );
}
