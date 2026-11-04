/**
 * 设置分组标题（卡片外，13px medium——对齐 macOS 系统设置，非大写）。
 * 新代码建议直接用 SettingsSection（标题 + 卡片一步写法）。
 */

export default function SectionHeader({ title }: { title: string }) {
  return (
    <div className="pb-2 pt-5 text-[13px] font-medium text-foreground/90 first:pt-1">
      {title}
    </div>
  );
}
