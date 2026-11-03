/**
 * 侧栏右缘宽度拖拽分割条（桌面形态，T6）。
 *
 * 指针捕获（setPointerCapture）拖拽实时回调宽度，松手才提交持久化，
 * 避免拖拽期间高频写 localStorage；双击复位默认档位。
 */

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clampSidebarWidth } from "@/stores/shellStore";

interface SidebarResizeHandleProps {
  /** 当前生效宽度（拖拽起始基准，用于复位展示） */
  width: number;
  /** 拖拽中实时回调（调用方本地态渲染，不落库） */
  onResize: (width: number) => void;
  /** 拖拽结束提交（落库持久化） */
  onCommit: (width: number) => void;
  /** 双击复位默认宽度 */
  onReset: () => void;
}

export default function SidebarResizeHandle({
  width,
  onResize,
  onCommit,
  onReset,
}: SidebarResizeHandleProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; width: number } | null>(null);

  const endDrag = (commit: boolean, finalWidth: number) => {
    dragStartRef.current = null;
    setDragging(false);
    document.body.classList.remove("select-none");
    if (commit) {
      onCommit(finalWidth);
    }
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      aria-label={t("shell.resizeSidebar")}
      className={`absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize transition-colors ${
        dragging ? "bg-primary/25" : "hover:bg-primary/15"
      }`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragStartRef.current = { x: event.clientX, width };
        setDragging(true);
        // 拖拽期间禁用文本选择，松手恢复
        document.body.classList.add("select-none");
      }}
      onPointerMove={(event) => {
        const start = dragStartRef.current;
        if (!start) return;
        onResize(clampSidebarWidth(start.width + (event.clientX - start.x)));
      }}
      onPointerUp={(event) => {
        const start = dragStartRef.current;
        if (!start) return;
        endDrag(true, clampSidebarWidth(start.width + (event.clientX - start.x)));
      }}
      onPointerCancel={() => {
        const start = dragStartRef.current;
        if (!start) return;
        endDrag(false, start.width);
      }}
      onDoubleClick={onReset}
    />
  );
}
