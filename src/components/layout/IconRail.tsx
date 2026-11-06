/**
 * 最左竖直图标栏（微信式模块导航，M2 路由版）。
 *
 * 60px 栏宽；入口 40x40，鼠标悬浮时显示深色背景块（--rail-tile 语义 token），
 * 无动画。选中态由 NavLink 驱动（primary 蓝块），/panes/:projectId 下消息入口
 * 依然保持激活。底部：帮助入口。
 */

import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";
import { CircleHelp, MessageSquare, PieChart, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { RAIL_WIDTH } from "./views";

type Entry = {
  to: string;
  icon: typeof MessageSquare;
  labelKey: string;
};

const ENTRIES: ReadonlyArray<Entry> = [
  { to: "/panes", icon: MessageSquare, labelKey: "rail.messages" },
  { to: "/settings", icon: Settings, labelKey: "rail.settings" },
  { to: "/cost", icon: PieChart, labelKey: "rail.stats" },
];

/** 40x40 图标块：NavLink 激活态 = primary 蓝块；悬浮 = 深色块（无动画） */
function RailLink({ to, icon: Icon, labelKey }: Entry) {
  const { t } = useTranslation();
  const label = t(labelKey);
  return (
    <NavLink
      to={to}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          "flex h-10 w-10 items-center justify-center rounded-[10px]",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-rail-tile hover:text-rail-tile-foreground",
        )
      }
    >
      <Icon size={17} strokeWidth={2} />
    </NavLink>
  );
}

export default function IconRail() {
  return (
    <aside
      className="surface-blur flex flex-shrink-0 flex-col items-center gap-2 border-r border-border/60 py-3"
      style={{ width: RAIL_WIDTH }}
    >
      {ENTRIES.map((entry) => (
        <RailLink key={entry.to} {...entry} />
      ))}
      <div className="flex-1" />
      {/* 底部拓展位：帮助 */}
      <RailLink to="/help" icon={CircleHelp} labelKey="shell.viewHelp" />
    </aside>
  );
}
