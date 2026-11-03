/**
 * 设置分组标题（11px muted 大写字距，规范 1.1 节）。
 */

export default function SectionHeader({ title }: { title: string }) {
  return (
    <div className="pb-1.5 pt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70 first:pt-1">
      {title}
    </div>
  );
}
