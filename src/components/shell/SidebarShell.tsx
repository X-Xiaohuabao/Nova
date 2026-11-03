/**
 * macOS 风格侧栏外壳（纯样式骨架版）。
 *
 * 毛玻璃表面 + 细分隔线；内容为静态占位（搜索框样式、分组、行高亮示例），
 * 不接项目树/会话等任何业务功能。文案走 i18n。
 */

import { useTranslation } from "react-i18next";

interface SidebarShellProps {
  /** 侧栏宽度（px），默认 200 */
  width?: number;
}

export default function SidebarShell({ width = 200 }: SidebarShellProps) {
  const { t } = useTranslation();

  const groups = [
    {
      label: t("shell.groupProjects"),
      items: [
        { name: "nvo-switch", active: true },
        { name: "teacoder-docs" },
        { name: "playground" },
      ],
    },
    {
      label: t("shell.groupFavorites"),
      items: [{ name: t("shell.sampleSession") }, { name: t("shell.sampleSsh") }],
    },
  ];

  return (
    <aside
      className="surface-blur flex flex-shrink-0 flex-col border-r border-border/60"
      style={{ width }}
    >
      {/* 搜索框样式占位（无输入逻辑） */}
      <div className="p-2.5">
        <div className="flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-muted-foreground/70">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span className="text-xs">{t("common.search")}</span>
        </div>
      </div>

      {/* 分组与行占位 */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            <ul>
              {group.items.map((item) => (
                <li key={item.name}>
                  <div
                    className={`flex h-7 items-center gap-2 rounded-md px-2 text-[13px] transition-colors ${
                      item.active
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground/85 hover:bg-accent/60"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 flex-shrink-0 rounded-full bg-primary/70"
                    />
                    <span className="truncate">{item.name}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* 底部占位：新建按钮样式 */}
      <div className="border-t border-border/60 p-2">
        <div className="flex h-7 items-center justify-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="text-xs">{t("shell.newSession")}</span>
        </div>
      </div>
    </aside>
  );
}
