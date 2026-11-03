/**
 * macOS 风格窗口骨架容器。
 *
 * 组合：标题栏（毛玻璃 + 交通灯）→ 主体（侧栏 + 内容区）→ 状态条。
 * 内容区为插槽（children），可挂载终端 / 聊天 / 设置等任意视图；
 * 缺省渲染静态占位。窗口控制经 lib/tauri/window 封装（预览环境自动降级）。
 *
 * 响应式：<768px 时自适应移动端形态——容器铺满视口（无圆角投影），
 * 侧栏收为抽屉（标题栏汉堡按钮唤出）；≥768px 恢复桌面窗口形态。
 * 桌面侧栏支持折叠（收为图标窄条）与宽度拖拽（200~320px，双击复位），
 * 偏好经 shellStore 持久化。文案走 i18n。
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { runtimeKind } from "@/lib/bridge";
import type { RuntimeKind } from "@/lib/bridge";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
  shellStore,
} from "@/stores/shellStore";
import SidebarResizeHandle from "./SidebarResizeHandle";
import SidebarShell from "./SidebarShell";
import StatusBarShell from "./StatusBarShell";
import TitleBar from "./TitleBar";

interface WindowFrameProps {
  /** 窗口标题 */
  title: string;
  /** 当前是否深色主题（预览切换用） */
  dark: boolean;
  /** 切换主题回调（预览切换用） */
  onToggleTheme: () => void;
  /** 运行时形态；缺省自动检测。预览页可用 ?platform=mobile 覆盖演示 web-remote 形态 */
  runtime?: RuntimeKind;
  /** 内容区插槽；缺省渲染静态占位 */
  children?: ReactNode;
}

function DefaultContentPlaceholder() {
  const { t } = useTranslation();

  const cards = [
    { label: t("shell.cardTabs") },
    { label: t("shell.cardTerminal") },
    { label: t("shell.cardCost") },
  ];

  return (
    <main className="placeholder-in flex flex-1 flex-col items-center justify-center gap-4 overflow-hidden">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="m8 9-4 3 4 3M16 9l4 3-4 3M13 5l-2 14" />
          </svg>
        </div>
        <p className="text-[13px] font-medium">{t("shell.contentTitle")}</p>
        <p className="text-xs text-muted-foreground/70">{t("shell.contentDesc")}</p>
      </div>

      {/* 卡片质感示例（card token 效果） */}
      <div className="flex gap-3">
        {cards.map(({ label }) => (
          <div
            key={label}
            className="flex h-16 w-36 flex-col justify-between rounded-lg border border-border/70 bg-card p-3 shadow-sm transition-colors hover:border-primary/40"
          >
            <span className="text-xs font-medium text-foreground/85">{label}</span>
            <span className="text-[11px] text-muted-foreground/70">{t("shell.cardPlaceholder")}</span>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function WindowFrame({
  title,
  dark,
  onToggleTheme,
  runtime,
  children,
}: WindowFrameProps) {
  const kind = runtime ?? runtimeKind();
  const isDesktop = kind === "tauri-desktop";

  // 桌面侧栏折叠态与宽度（持久化）；拖拽中经本地态渲染，松手才落库
  const collapsed = shellStore((s) => s.sidebarCollapsed);
  const storedWidth = shellStore((s) => s.sidebarWidth);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  // 移动端抽屉开合；桌面侧栏常驻，不受此状态影响
  const [drawerOpen, setDrawerOpen] = useState(false);

  const desktopWidth = collapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : dragWidth ?? storedWidth;

  const isMobileViewport = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches;

  // 标题栏侧栏按钮：<768px 开合抽屉，桌面切换折叠态
  const toggleSidebar = () => {
    if (isMobileViewport()) {
      setDrawerOpen((prev) => !prev);
      return;
    }
    shellStore.getState().setSidebarCollapsed(!collapsed);
  };

  useEffect(() => {
    setDragWidth(null);
  }, [storedWidth]);

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-background md:h-[680px] md:w-[1000px] md:rounded-[10px] md:border md:border-border/80 md:shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    >
      <TitleBar
        title={title}
        dark={dark}
        onToggleTheme={onToggleTheme}
        showWindowControls={isDesktop}
        onToggleSidebar={toggleSidebar}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* 桌面侧栏：≥768px 常驻；折叠态收为图标窄条，右缘可拖拽调宽 */}
        <div className="relative hidden md:flex">
          <SidebarShell width={desktopWidth} collapsed={collapsed} />
          {!collapsed && (
            <SidebarResizeHandle
              width={desktopWidth}
              onResize={setDragWidth}
              onCommit={(width) => shellStore.getState().setSidebarWidth(width)}
              onReset={() =>
                shellStore.getState().setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)
              }
            />
          )}
        </div>

        {/* 移动端抽屉：<768px 由汉堡按钮唤出，滑入 + 遮罩 */}
        <div
          className={`fixed inset-0 z-40 md:hidden ${drawerOpen ? "" : "pointer-events-none"}`}
          aria-hidden={!drawerOpen}
        >
          <div
            role="presentation"
            onClick={() => setDrawerOpen(false)}
            className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
              drawerOpen ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            className={`absolute inset-y-0 left-0 flex bg-background shadow-2xl transition-transform duration-200 ${
              drawerOpen ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <SidebarShell width={260} />
          </div>
        </div>

        {children ?? <DefaultContentPlaceholder />}
      </div>

      <StatusBarShell runtime={kind} />
    </div>
  );
}
