/**
 * CLI 工具状态条（新骨架，H5 / T13）。
 *
 * 已装工具图标 + 版本提示（原生 title）+ 重新检测；图标沿用 PNG 品牌
 * 识别（旧资产），lucide 抽象化随 T15 统一处理。
 */

import { useTranslation } from "react-i18next";
import { RotateCw } from "lucide-react";
import { useAppStore } from "../../stores/appStore";
import { detectCliTools } from "../../utils/ipc";

const TOOL_ICONS: Record<string, string> = {
  claude: "/claude.png",
  codex: "/codex.png",
  gemini: "/gemini.png",
  opencode: "/opencode.png",
};

export default function CliToolStatusNext() {
  const { t } = useTranslation();
  const cliTools = useAppStore((s) => s.cliTools);
  const setCliTools = useAppStore((s) => s.setCliTools);

  const handleRedetect = () => {
    detectCliTools().then(setCliTools).catch(() => {});
  };

  return (
    <div className="flex flex-shrink-0 items-center gap-1.5 px-3 pb-1 pt-3">
      {cliTools.map((tool) => (
        <div
          key={tool.toolType}
          title={
            tool.isAvailable
              ? `${tool.version || t("cli.unknownVersion")} · ${tool.path || ""}`
              : t("cli.notInstalled")
          }
          className="flex h-6 w-6 cursor-default items-center justify-center rounded"
          style={{
            opacity: tool.isAvailable ? 1 : 0.3,
            filter: tool.isAvailable ? "none" : "grayscale(1)",
          }}
        >
          <img src={TOOL_ICONS[tool.toolType]} alt={tool.toolType} className="h-5 w-5" draggable={false} />
        </div>
      ))}
      <button
        type="button"
        title={t("cli.redetect")}
        aria-label={t("cli.redetect")}
        className="ml-auto cursor-pointer text-muted-foreground/50 transition-colors hover:text-foreground"
        onClick={handleRedetect}
      >
        <RotateCw size={11} />
      </button>
    </div>
  );
}
