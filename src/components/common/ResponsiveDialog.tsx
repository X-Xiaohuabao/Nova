/**
 * 响应式弹层封装（规范：doc/design-ui-patterns.md 第 2 章）。
 *
 * ≥768px 渲染居中 Dialog（宽度档位 sm 480 / md 560 / lg 640）；
 * <768px 渲染底部 Sheet——全宽滑入、顶部圆角 12px + 拖拽把手、
 * 高度 ≤85vh 内部滚动，把手下拉超过 80px 关闭（遮罩点击 / Esc 亦可关闭）。
 * 所有表单弹窗一律经本组件，禁止直接裸用 Dialog。
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** 宽度档位（≥768px 桌面 Dialog 用） */
const SIZE_CLASS: Record<NonNullable<ResponsiveDialogProps["size"]>, string> = {
  sm: "sm:max-w-[480px]",
  md: "sm:max-w-[560px]",
  lg: "sm:max-w-[640px]",
};

/** 把手下拉关闭阈值（px） */
const DRAG_CLOSE_THRESHOLD = 80;

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: string;
  /** 内容主体（超高内部滚动） */
  children: ReactNode;
  /** 底部动作区（按钮组） */
  footer?: ReactNode;
  /** 桌面 Dialog 宽度档位，默认 md（560px） */
  size?: "sm" | "md" | "lg";
  /** 追加到桌面 Dialog 内容容器的类（如自定义宽度档） */
  contentClassName?: string;
}

/** ≥768px 断点（响应式，横竖屏/窗口调整即时跟随） */
function useDesktopBreakpoint(): boolean {
  const query = "(min-width: 768px)";
  const [matches, setMatches] = useState(
    () => window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export default function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "md",
  contentClassName,
}: ResponsiveDialogProps) {
  const isDesktop = useDesktopBreakpoint();

  // 底部 Sheet 把手下拉手势状态
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartYRef = useRef<number | null>(null);

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={`flex max-h-[85vh] flex-col gap-0 overflow-hidden ${SIZE_CLASS[size]} ${contentClassName ?? ""}`}
        >
          <DialogHeader className="pb-3">
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription className="mt-1.5">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-1">
            {children}
          </div>
          {footer && (
            <DialogFooter className="pt-3">{footer}</DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="mx-0 max-h-[85vh] gap-0 rounded-t-xl border-t-0 px-0 pb-0"
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : undefined,
        }}
      >
        {/* 把手：拖拽下拉超阈值关闭；触摸端禁用浏览器默认滚动干扰 */}
        <div
          role="presentation"
          className="flex h-8 w-full shrink-0 cursor-grab touch-none items-center justify-center"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            dragStartYRef.current = event.clientY;
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const start = dragStartYRef.current;
            if (start === null) return;
            setDragY(Math.max(0, event.clientY - start));
          }}
          onPointerUp={() => {
            const shouldClose = dragY > DRAG_CLOSE_THRESHOLD;
            dragStartYRef.current = null;
            setDragging(false);
            setDragY(0);
            if (shouldClose) {
              onOpenChange(false);
            }
          }}
          onPointerCancel={() => {
            dragStartYRef.current = null;
            setDragging(false);
            setDragY(0);
          }}
        >
          <span
            aria-hidden
            className="h-1 w-9 rounded-full bg-muted-foreground/40"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4">
          <SheetHeader className="p-0 pb-3">
            <SheetTitle className="text-[15px] font-semibold">
              {title}
            </SheetTitle>
            {description && (
              <SheetDescription className="mt-1.5">
                {description}
              </SheetDescription>
            )}
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">{children}</div>
          {footer && <SheetFooter className="p-0 pt-3">{footer}</SheetFooter>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
