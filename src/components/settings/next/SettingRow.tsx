/**
 * 设置行通用件（规范：doc/design-ui-patterns.md 第 1.1 节）。
 *
 * 放在 SettingsCard 内使用：label 左 / 控件右对齐，行高 36px 基准；
 * <768px 改上下堆叠（label 上 / 控件下）。行间 hairline 由卡片 divide-y 提供。
 * id 作为搜索定位锚点；highlight 为命中高亮态（搜索点击定位后短暂点亮）。
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingRowProps {
  /** 锚点 id（搜索定位滚动目标，与搜索索引键对应） */
  id?: string;
  label: string;
  description?: string;
  /** 搜索命中高亮 */
  highlight?: boolean;
  children: ReactNode;
}

export default function SettingRow({ id, label, description, highlight, children }: SettingRowProps) {
  return (
    <div
      id={id}
      className={cn(
        "flex flex-col gap-1.5 px-4 py-2.5 transition-colors md:flex-row md:items-center md:gap-3 md:min-h-9",
        highlight && "bg-primary/10 ring-1 ring-inset ring-primary/40",
      )}
    >
      <div className="md:w-56 md:flex-shrink-0">
        <div className="text-[13px] text-foreground/90">{label}</div>
        {description && (
          <div className="text-[11px] text-muted-foreground/70">{description}</div>
        )}
      </div>
      <div className="flex flex-shrink-0 md:ml-auto">{children}</div>
    </div>
  );
}
