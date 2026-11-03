import { useRef, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface PaneSplitterProps {
  /** 当前分屏比例，0~1 */
  ratio: number;
  onRatioChange: (next: number) => void;
  /** 父容器 ref，用于把鼠标位置换算为比例 */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 垂直拖动条：拖动后改变左侧面板宽度比例（0.2~0.8）。
 * 用 4px 透明 hit-area + 视觉 1px 中线的"双层"做法，方便用户命中。
 * 样式走语义 token（macOS 骨架 T7 起）。
 */
export default function PaneSplitter({ ratio, onRatioChange, containerRef }: PaneSplitterProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startRatio = useRef(ratio);
  const containerWidth = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      containerWidth.current = container.getBoundingClientRect().width;
      startX.current = e.clientX;
      startRatio.current = ratio;
      setDragging(true);
    },
    [ratio, containerRef],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX.current;
      const delta = dx / containerWidth.current;
      const next = Math.max(0.2, Math.min(0.8, startRatio.current + delta));
      onRatioChange(next);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragging, onRatioChange]);

  return (
    <div
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("panes.resizeSplit")}
      className={cn(
        "relative flex-shrink-0 cursor-col-resize bg-border/60 transition-colors",
        dragging && "bg-primary",
      )}
      style={{ width: 4 }}
    >
      {/* 加宽的命中区，避免 4px 太窄难命中 */}
      <div
        className="absolute inset-y-0"
        style={{ left: -4, right: -4, cursor: "col-resize" }}
      />
      {/* 视觉中线（拖拽时高亮） */}
      <div
        className={cn(
          "absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors",
          dragging ? "bg-primary" : "bg-transparent",
        )}
      />
    </div>
  );
}
