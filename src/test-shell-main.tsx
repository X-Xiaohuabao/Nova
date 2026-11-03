import { StrictMode, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import ChatPlaceholder from "@/components/chat/ChatPlaceholder";
import ResponsiveDialog from "@/components/common/ResponsiveDialog";
import SettingsPageNext from "@/components/settings/next/SettingsPageNext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Toaster } from "@/components/ui/sonner";
import WindowFrame from "@/components/shell/WindowFrame";
import { changeLanguage, SUPPORTED_LANGUAGES } from "@/i18n";
import type { Language } from "@/i18n";
import type { RuntimeKind } from "@/lib/bridge";
import { themeStore, initTheme } from "@/stores/themeStore";
import type { ThemeMode } from "@/stores/themeStore";
import "./i18n";
import "./styles/shell.css";

/**
 * 浏览器端窗口骨架预览台。
 *
 * 配合 shell-test.html 使用：展示 macOS 风格窗口样式（标题栏/交通灯/侧栏/
 * 状态条/语义 token 明暗两套）。内容区通过 children 插槽挂载 ChatPlaceholder；
 * 窗口控制经 lib/tauri/window 封装，预览环境自动降级 no-op。
 *
 * 主题走 themeStore 三态（浅色/深色/跟随系统），左下角浮动按钮循环切换，
 * 切换即时生效并持久化（localStorage），刷新保持。
 *
 * 预览开关（URL 参数）：
 * - ?theme=light|dark  覆盖初始主题（演示用）
 * - ?platform=mobile   按 web-remote 形态渲染（隐藏交通灯、WS 桥标识）
 * 左下角浮动按钮切换中/EN，验证 i18n 通道。
 */
function ShellPreview() {
  const { t, i18n } = useTranslation();
  const mode = themeStore((s) => s.mode);
  const resolved = themeStore((s) => s.resolved);
  // 组件演示（T5 验证用：ResponsiveDialog 双壳 + 最小组件集）
  const [demoOpen, setDemoOpen] = useState(false);
  // 内容区视图切换：聊天占位 / 设置中心（T9 验证用）
  const [view, setView] = useState<"chat" | "settings">("chat");
  const runtime: RuntimeKind =
    new URLSearchParams(window.location.search).get("platform") === "mobile"
      ? "web-remote"
      : "tauri-desktop";

  useEffect(() => {
    const override = new URLSearchParams(window.location.search).get("theme");
    if (override === "light" || override === "dark") {
      themeStore.getState().setMode(override);
    }
  }, []);

  const toggleLanguage = () => {
    const next: Language = i18n.language === "zh-CN" ? "en-US" : "zh-CN";
    changeLanguage(next);
  };

  // 三态循环：浅色 → 深色 → 跟随系统
  const cycleTheme = () => {
    const next: ThemeMode =
      mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    themeStore.getState().setMode(next);
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <WindowFrame
        title="TeaCoder"
        dark={resolved === "dark"}
        onToggleTheme={cycleTheme}
        runtime={runtime}
      >
        {view === "chat" ? <ChatPlaceholder /> : <SettingsPageNext />}
      </WindowFrame>

      {/* 预览专用：内容区视图切换（T9 验证用） */}
      <button
        type="button"
        onClick={() => setView((v) => (v === "chat" ? "settings" : "chat"))}
        className="fixed top-3 left-3 z-50 rounded-md border border-white/20 bg-black/50 px-2 py-1 text-xs text-white/80 backdrop-blur transition-colors hover:bg-black/70"
      >
        {view === "chat" ? t("shell.viewSettings") : t("shell.viewChat")}
      </button>
      {/* 预览专用：组件集演示（T5 验证用） */}
      <button
        type="button"
        onClick={() => setDemoOpen(true)}
        className="fixed top-3 left-3 z-50 rounded-md border border-white/20 bg-black/50 px-2 py-1 text-xs text-white/80 backdrop-blur transition-colors hover:bg-black/70"
      >
        {t("shell.demoComponents")}
      </button>
      <ResponsiveDialog
        open={demoOpen}
        onOpenChange={setDemoOpen}
        title={t("shell.demoComponents")}
        description={t("shell.demoDesc")}
        footer={
          <Button variant="outline" onClick={() => setDemoOpen(false)}>
            {t("common.close")}
          </Button>
        }
      >
        <div className="flex flex-col gap-3 py-1">
          <Input placeholder={t("common.search")} />
          <Separator />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm">{t("shell.newSession")}</Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => toast.success(t("shell.demoToast"))}
            >
              {t("shell.demoToastTrigger")}
            </Button>
            <Button size="xs" variant="ghost">
              {t("theme.system")}
            </Button>
            <Button size="icon-sm" variant="destructive" aria-label={t("common.close")}>
              <span aria-hidden className="text-xs">✕</span>
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
      <Toaster position="bottom-right" />
      {/* 预览专用：三态主题切换演示（正式入口在设置页，见 T9） */}
      <button
        type="button"
        onClick={cycleTheme}
        aria-label={t("shell.toggleThemePreview")}
        className="fixed bottom-3 left-3 z-50 rounded-md border border-white/20 bg-black/50 px-2 py-1 text-xs text-white/80 backdrop-blur transition-colors hover:bg-black/70"
      >
        {t("theme.light")} / {t("theme.dark")} / {t("theme.system")} ·{" "}
        {t(`theme.${mode}`)}
      </button>
      {/* 预览专用：语言切换演示（正式入口在设置页，见 I3） */}
      <button
        type="button"
        onClick={toggleLanguage}
        className="fixed bottom-12 left-3 z-50 rounded-md border border-white/20 bg-black/50 px-2 py-1 text-xs text-white/80 backdrop-blur transition-colors hover:bg-black/70"
      >
        {i18n.language === "zh-CN" ? "中 / EN" : "EN / 中"}
      </button>
      <span className="fixed bottom-3 right-3 z-50 text-[10px] text-white/40">
        {SUPPORTED_LANGUAGES.join(" · ")}
      </span>
    </div>
  );
}

// 主题初始化：应用持久化档位并绑定系统偏好监听（幂等）
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ShellPreview />
  </StrictMode>,
);
