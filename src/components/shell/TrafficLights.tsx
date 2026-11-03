/**
 * macOS 交通灯窗口控制按钮。
 *
 * 视觉：红（关闭）/黄（最小化）/绿（最大化）三圆点，鼠标悬停整组时浮现符号。
 * 行为：通过 lib/tauri/window 封装操作真实窗口；浏览器预览环境自动降级 no-op。
 * aria-label 走 i18n。
 */

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { closeWindow, minimizeWindow, toggleMaximizeWindow } from "@/lib/tauri/window";

interface TrafficLightsProps {
  /** 透传给整组的额外类名 */
  className?: string;
}

function DotGlyph({
  color,
  label,
  glyph,
  onClick,
}: {
  color: string;
  label: string;
  glyph: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="traffic-light"
      style={{ backgroundColor: color }}
      onClick={onClick}
    >
      {glyph}
    </button>
  );
}

export default function TrafficLights({ className }: TrafficLightsProps) {
  const { t } = useTranslation();

  return (
    <div className={cn("traffic-light-group flex items-center gap-2", className)}>
      <DotGlyph
        color="#ff5f57"
        label={t("shell.close")}
        glyph={
          <svg viewBox="0 0 8 8" fill="none" stroke="#4d0508" strokeWidth="1.3" strokeLinecap="round">
            <path d="M1.7 1.7 L6.3 6.3 M6.3 1.7 L1.7 6.3" />
          </svg>
        }
        onClick={closeWindow}
      />
      <DotGlyph
        color="#febc2e"
        label={t("shell.minimize")}
        glyph={
          <svg viewBox="0 0 8 8" fill="none" stroke="#97600a" strokeWidth="1.3" strokeLinecap="round">
            <path d="M1.7 4 H6.3" />
          </svg>
        }
        onClick={minimizeWindow}
      />
      <DotGlyph
        color="#28c840"
        label={t("shell.maximize")}
        glyph={
          <svg viewBox="0 0 8 8" fill="#0a5c20" stroke="none">
            {/* macOS 全屏符号：左上 + 右下两个实心三角，对角朝外 */}
            <path d="M1.1 4.9 L1.1 1.1 L4.9 1.1 Z" />
            <path d="M6.9 3.1 L6.9 6.9 L3.1 6.9 Z" />
          </svg>
        }
        onClick={() => void toggleMaximizeWindow()}
      />
    </div>
  );
}
