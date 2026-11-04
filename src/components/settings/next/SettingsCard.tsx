/**
 * 设置分组卡片（macOS 系统设置 Ventura 风格）。
 *
 * 一组设置 = 标题（卡片外）+ 圆角色块卡（bg-card 在 bg-background 上分层，
 * 行间 hairline 分割）。配合 SectionHeader 使用：
 *
 *   <SectionHeader title="外观" />
 *   <SettingsCard>…SettingRow…</SettingsCard>
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsCardProps {
  children: ReactNode;
  className?: string;
}

export default function SettingsCard({ children, className }: SettingsCardProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/40 bg-card",
        className,
      )}
    >
      <div className="divide-y divide-border/40">{children}</div>
    </div>
  );
}

/** 标题 + 卡片组合（页内最常用模式的一步写法） */
export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <SectionTitle title={title} />
      <SettingsCard>{children}</SettingsCard>
    </>
  );
}

/** 分组标题（卡片外，13px medium——对齐 macOS 系统设置） */
export function SectionTitle({ title }: { title: string }) {
  return (
    <div className="pb-2 pt-5 text-[13px] font-medium text-foreground/90 first:pt-1">
      {title}
    </div>
  );
}
