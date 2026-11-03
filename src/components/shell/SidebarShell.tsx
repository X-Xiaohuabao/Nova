/**
 * macOS 风格侧栏外壳（纯样式骨架版）。
 *
 * 毛玻璃表面 + 细分隔线；内容为静态占位（搜索框样式、分组、行高亮示例），
 * 不接项目树/会话等任何业务功能。文案走 i18n。
 *
 * 折叠态（collapsed）：收为图标窄条（56px）——搜索框/分组标题/文字全部收起，
 * 仅保留图标行，供壳层折叠切换（T6）使用。
 */

import { useTranslation } from "react-i18next";

interface SidebarShellProps {
  /** 侧栏宽度（px），默认 200；折叠态忽略此值 */
  width?: number;
  /** 是否折叠为图标窄条 */
  collapsed?: boolean;
}

export default function SidebarShell({ width = 200, collapsed = false }: SidebarShellProps) {
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
      style={{ width: collapsed ? 56 : width }}
    >
      {/* 搜索框样式占位（无输入逻辑）；折叠态收为图标按钮 */}
      <div className="p-2.5">
        {collapsed ? (
          <div
            role="presentation"
            aria-label={t("common.search")}
            className="flex h-7 items-center justify-center rounded-md bg-muted text-muted-foreground/70"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
        ) : (
          <div className="flex h-7 items-center gap-1.5 rounded-md bg-muted px-2 text-muted-foreground/70">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="text-xs">{t("common.search")}</span>
          </div>
        )}
      </div>

      {/* 分组与行占位 */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            {!collapsed && (
              <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </div>
            )}
            <ul>
              {group.items.map((item) => (
                <li key={item.name}>
                  <div
                    title={collapsed ? item.name : undefined}
                    aria-label={collapsed ? item.name : undefined}
                    className={`flex h-7 items-center gap-2 rounded-md px-2 text-[13px] transition-colors ${
                      collapsed ? "justify-center" : ""
                    } ${
                      item.active
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground/85 hover:bg-accent/60"
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 flex-shrink-0 rounded-full bg-primary/70"
                    />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* 底部占位：新建按钮样式；折叠态收为图标 */}
      <div className="border-t border-border/60 p-2">
        <div
          role="presentation"
          aria-label={t("shell.newSession")}
          className={`flex h-7 items-center justify-center gap-1.5 rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${
            collapsed ? "" : "px-2"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {!collapsed && <span className="text-xs">{t("shell.newSession")}</span>}
        </div>
      </div>
    </aside>
  );
}
