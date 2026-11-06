/**
 * 最左竖直图标栏（微信式模块导航，M1 布局版）。
 *
 * 60px 栏宽；入口 40x40，鼠标悬浮时显示深色背景块（--rail-tile 语义 token），
 * 无动画。选中态切 primary 蓝块。
 * 消息(panes)/设置/统计 三个入口，帮助等后续按需拓展。
 * M2 路由化后选中态改由 NavLink 驱动，本组件只保留图标渲染。
 */

import { useTranslation } from "react-i18next";
import { MessageSquare, PieChart, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MainView } from "./views";

const ENTRIES: ReadonlyArray<{
  view: MainView;
  icon: typeof MessageSquare;
  labelKey: string;
}> = [
  { view: "panes", icon: MessageSquare, labelKey: "rail.messages" },
  { view: "settings", icon: Settings, labelKey: "rail.settings" },
  { view: "cost", icon: PieChart, labelKey: "rail.stats" },
];

interface IconRailProps {
  view: MainView;
  onViewChange: (view: MainView) => void;
}

export default function IconRail({ view, onViewChange }: IconRailProps) {
  const { t } = useTranslation();
  return (
    <aside className="surface-blur flex w-[60px] flex-shrink-0 flex-col items-center gap-2 border-r border-border/60 py-3">
      {ENTRIES.map(({ view: entryView, icon: Icon, labelKey }) => {
        const active = view === entryView;
        const label = t(labelKey);
        return (
          <button
            key={entryView}
            type="button"
            title={label}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            onClick={() => onViewChange(entryView)}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-[10px]",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-rail-tile hover:text-rail-tile-foreground",
            )}
          >
            <Icon size={17} strokeWidth={2} />
          </button>
        );
      })}
      {/* 底部预留：折叠/更多等拓展入口 */}
    </aside>
  );
}
