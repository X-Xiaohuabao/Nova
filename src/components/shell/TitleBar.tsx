/**
 * macOS 风格顶部标题栏。
 *
 * 结构：交通灯（左）→ 居中窗口标题 → 右侧占位按钮组。
 * 毛玻璃表面 + 整条可拖拽（data-tauri-drag-region，浏览器预览下无副作用）。
 * 主题切换按钮仅用于预览明暗两套 token，不落全局状态。
 * 窗口控制按钮按运行时显隐：web-remote（手机/网页端）没有窗口装饰，隐藏。
 */

import { useTranslation } from "react-i18next";
import TrafficLights from "./TrafficLights";

interface TitleBarProps {
  /** 窗口标题 */
  title: string;
  /** 当前是否深色主题（预览切换用） */
  dark: boolean;
  /** 切换主题回调（预览切换用） */
  onToggleTheme: () => void;
  /** 是否显示窗口控制按钮；web-remote 运行时应传 false */
  showWindowControls?: boolean;
  /** 移动端侧栏抽屉开合回调；传入后渲染汉堡按钮（仅 <768px 显示） */
  onToggleSidebar?: () => void;
}

export default function TitleBar({
  title,
  dark,
  onToggleTheme,
  showWindowControls = true,
  onToggleSidebar,
}: TitleBarProps) {
  const { t } = useTranslation();

  return (
    <header
      data-tauri-drag-region
      className="surface-blur relative flex h-[38px] flex-shrink-0 items-center border-b border-border/70 px-3"
    >
      {/* 左：移动端汉堡按钮（<768px）+ 交通灯（仅桌面运行时） */}
      <div className="flex w-24 items-center gap-1">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={t("shell.openSidebar")}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:hidden"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}
        {showWindowControls && <TrafficLights />}
      </div>

      {/* 中：窗口标题（macOS 居中式） */}
      <div
        data-tauri-drag-region
        className="pointer-events-none absolute inset-x-0 flex justify-center"
      >
        <span className="text-[13px] font-semibold tracking-wide text-foreground/80">
          {title}
        </span>
      </div>

      {/* 右：占位动作区（骨架阶段仅主题切换演示） */}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={t("shell.toggleThemePreview")}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {dark ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
            </svg>
          )}
        </button>
        <div
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        </div>
      </div>
    </header>
  );
}
