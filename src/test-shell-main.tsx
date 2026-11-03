import { StrictMode, useState } from "react";
import ReactDOM from "react-dom/client";
import { useTranslation } from "react-i18next";
import ChatPlaceholder from "@/components/chat/ChatPlaceholder";
import WindowFrame from "@/components/shell/WindowFrame";
import { changeLanguage, SUPPORTED_LANGUAGES } from "@/i18n";
import type { Language } from "@/i18n";
import type { RuntimeKind } from "@/lib/bridge";
import "./i18n";
import "./styles/shell.css";

/**
 * 浏览器端窗口骨架预览台。
 *
 * 配合 shell-test.html 使用：展示 macOS 风格窗口样式（标题栏/交通灯/侧栏/
 * 状态条/语义 token 明暗两套）。内容区通过 children 插槽挂载 ChatPlaceholder；
 * 窗口控制经 lib/tauri/window 封装，预览环境自动降级 no-op。
 *
 * 预览开关（URL 参数）：
 * - ?theme=light|dark  初始主题
 * - ?platform=mobile   按 web-remote 形态渲染（隐藏交通灯、WS 桥标识）
 * 左下角浮动按钮切换中/EN，验证 i18n 通道。
 */
function ShellPreview() {
  const { t, i18n } = useTranslation();
  const [dark, setDark] = useState(() => {
    const theme = new URLSearchParams(window.location.search).get("theme");
    return theme !== "light";
  });
  const [runtime] = useState<RuntimeKind>(() => {
    const platform = new URLSearchParams(window.location.search).get("platform");
    return platform === "mobile" ? "web-remote" : "tauri-desktop";
  });

  const toggleTheme = () => {
    setDark((prev) => {
      const next = !prev;
      const root = document.documentElement;
      root.classList.toggle("dark", next);
      root.classList.toggle("light", !next);
      return next;
    });
  };

  const toggleLanguage = () => {
    const next: Language = i18n.language === "zh-CN" ? "en-US" : "zh-CN";
    changeLanguage(next);
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <WindowFrame
        title="TeaCoder"
        dark={dark}
        onToggleTheme={toggleTheme}
        runtime={runtime}
      >
        <ChatPlaceholder />
      </WindowFrame>

      {/* 预览专用：语言切换演示（正式入口在设置页，见 I3） */}
      <button
        type="button"
        onClick={toggleLanguage}
        className="fixed bottom-3 left-3 z-50 rounded-md border border-white/20 bg-black/50 px-2 py-1 text-xs text-white/80 backdrop-blur transition-colors hover:bg-black/70"
      >
        {i18n.language === "zh-CN" ? "中 / EN" : "EN / 中"} · {t("shell.ready")}
      </button>
      <span className="fixed bottom-3 right-3 z-50 text-[10px] text-white/40">
        {SUPPORTED_LANGUAGES.join(" · ")}
      </span>
    </div>
  );
}

// 默认深色；?theme=light 时初始为浅色（与 ShellPreview 初始状态一致）
if (new URLSearchParams(window.location.search).get("theme") !== "light") {
  document.documentElement.classList.add("dark");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ShellPreview />
  </StrictMode>,
);
