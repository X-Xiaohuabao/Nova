/**
 * macOS 风格标签栏（新骨架，规范：.zcode/skills/macos-hig/SKILL.md 第 8 章）。
 *
 * 与旧 AntD TabBar 共存迁移（T15 拆除后顶替其名），对接同一 appStore 会话状态。
 * - 单行弹性收缩（flex-1 均分，active 1.2 权重，min 96 / max 200，永不换行）
 * - 毛玻璃融合条（surface-blur），溢出横向滚动 + 右缘渐隐
 * - 关闭钮 hover / active 显示；中键关闭；双击重命名（inline，Esc/失焦提交）
 * - 右键菜单：分屏右侧 / 关闭 / 关闭其他 / 关闭右侧 / 关闭全部
 * - 拖拽重排：HTML5 DnD（application/x-teacoder-tab；dragenter/dragover 必须
 *   preventDefault，否则 WebKit 不派发 drop）；中线判定插入位；指示线直改 DOM
 *   避免 dragover 高频重渲染；落位后 FLIP 位移动画（WAAPI）
 * - 状态点：运行中 = 绿色脉冲；未读/错误待智能体接入提供数据源后补全
 *
 * 文案走 i18n（tabs 命名空间）。
 */

import { useLayoutEffect, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useAppStore } from "@/stores/appStore";
import type { Session } from "@/types";
import { toolVisual } from "./tabVisuals";

const DND_MIME_TAB = "application/x-teacoder-tab";

/** 标签宽度约束（macos-hig 8.1） */
const TAB_MIN_WIDTH = 96;
const TAB_MAX_WIDTH = 200;

/** 拖拽负载（与旧实现同 MIME，跨栈兼容） */
interface DragPayload {
  tabId: string;
  sourcePaneId: string;
}

interface TabBarNextProps {
  paneId: string;
}

/** 单个标签内容（图标/标题/关闭钮），供 Tab 与重命名态复用 */
function TabFace({
  session,
  active,
  onClose,
  closeLabel,
}: {
  session: Session | undefined;
  active: boolean;
  onClose: () => void;
  closeLabel: string;
}) {
  const visual = toolVisual(session?.toolType ?? "terminal");

  return (
    <>
      {/* 状态点：运行中绿色脉冲；未读蓝/错误红待数据源就位后接入（见文件头注释） */}
      <span
        aria-hidden
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
          session?.isRunning
            ? "bg-success animate-pulse"
            : "bg-muted-foreground/30"
        }`}
      />
      <visual.Icon size={14} strokeWidth={2} />
      <span
        className={`min-w-0 flex-1 truncate text-left text-xs ${
          active ? "font-medium text-foreground" : "text-foreground/70"
        }`}
      >
        {session?.title || "—"}
      </span>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-xs text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground ${
          active
            ? "opacity-100"
            : "opacity-0 group-hover/tab:opacity-100"
        }`}
      >
        <X size={11} strokeWidth={2} />
      </button>
    </>
  );
}

export default function TabBarNext({ paneId }: TabBarNextProps) {
  const { t } = useTranslation();

  // store 订阅（selector 粒度到本 pane，避免其它 pane 变化引发重渲染）
  const pane = useAppStore((s) => s.panes.find((p) => p.id === paneId));
  const sessions = useAppStore((s) => s.sessions);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const closeOtherTabs = useAppStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useAppStore((s) => s.closeTabsToRight);
  const closeAllTabs = useAppStore((s) => s.closeAllTabs);
  const splitPane = useAppStore((s) => s.splitPane);
  const reorderTabInPane = useAppStore((s) => s.reorderTabInPane);
  const moveTabToPane = useAppStore((s) => s.moveTabToPane);
  const setNewSessionModalOpen = useAppStore((s) => s.setNewSessionModalOpen);
  const updateSession = useAppStore((s) => s.updateSession);

  const openTabIds = pane?.openTabIds ?? [];
  const activeTabId = pane?.activeTabId ?? null;

  const sessionOf = (id: string): Session | undefined =>
    sessions.find((s) => s.id === id);

  // 拖拽状态（指示线直改 DOM；捕获位置存 ref 不进 state，避免高频重渲染）
  const stripRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  // FLIP 落位动画：drop 前 [tabId → 视口 left]，store 更新后差值反向回置再归零
  const flipRectsRef = useRef<Map<string, number> | null>(null);

  // 重命名（inline 编辑）
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");

  const startRename = (tabId: string) => {
    const session = sessionOf(tabId);
    if (!session) return;
    setRenamingId(tabId);
    setRenamingValue(session.title ?? "");
  };

  const commitRename = () => {
    const id = renamingId;
    setRenamingId(null);
    if (!id) return;
    const next = renamingValue.trim();
    const session = sessionOf(id);
    if (session && next && next !== session.title) {
      void updateSession(id, { title: next });
    }
  };

  const handleRenameKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      commitRename();
    } else if (event.key === "Escape") {
      setRenamingId(null);
    }
  };

  /** 指示线定位：index 为插入位（0~length）；直改 style，不走 React 状态 */
  const showIndicator = (index: number) => {
    const strip = stripRef.current;
    const indicator = indicatorRef.current;
    if (!strip || !indicator) return;
    const tabs = Array.from(
      strip.querySelectorAll<HTMLElement>("[data-tab-id]"),
    );
    const containerRect = strip.getBoundingClientRect();
    const left =
      index >= tabs.length
        ? tabs.length > 0
          ? tabs[tabs.length - 1].getBoundingClientRect().right -
            containerRect.left
          : 0
        : tabs[index].getBoundingClientRect().left - containerRect.left;
    indicator.style.left = `${left}px`;
    indicator.style.opacity = "1";
  };

  const hideIndicator = () => {
    if (indicatorRef.current) {
      indicatorRef.current.style.opacity = "0";
    }
  };

  /** 记录落位前各 tab 视口 left，供 FLIP 动画 */
  const captureFlipRects = () => {
    const strip = stripRef.current;
    if (!strip) return;
    const rects = new Map<string, number>();
    strip
      .querySelectorAll<HTMLElement>("[data-tab-id]")
      .forEach((el) => rects.set(el.dataset.tabId ?? "", el.getBoundingClientRect().left));
    flipRectsRef.current = rects;
  };

  // store 落位后：FLIP——从旧位置滑到新位置
  useLayoutEffect(() => {
    const rects = flipRectsRef.current;
    if (!rects) return;
    flipRectsRef.current = null;
    const strip = stripRef.current;
    if (!strip) return;
    strip.querySelectorAll<HTMLElement>("[data-tab-id]").forEach((el) => {
      const prev = rects.get(el.dataset.tabId ?? "");
      if (prev === undefined) return;
      const dx = prev - el.getBoundingClientRect().left;
      if (Math.abs(dx) < 1) return;
      el.animate(
        [{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }],
        { duration: 160, easing: "ease-out" },
      );
    });
  });

  /** drop 落位：insertIndex 为目标 pane「移除前」坐标系（与旧实现一致） */
  const applyDrop = (payload: DragPayload, insertIndex: number) => {
    if (payload.sourcePaneId === paneId) {
      const from = openTabIds.indexOf(payload.tabId);
      if (from < 0) return;
      let to = insertIndex;
      // 移除位在插入位之前时，落位坐标需左移一位
      if (from < to) to -= 1;
      if (to !== from) {
        reorderTabInPane(paneId, from, to);
      }
    } else {
      moveTabToPane(payload.tabId, paneId, insertIndex);
    }
  };

  const handleTabDragStart = (event: DragEvent<HTMLDivElement>, tabId: string) => {
    event.dataTransfer.setData(DND_MIME_TAB, JSON.stringify({ tabId, sourcePaneId: paneId } satisfies DragPayload));
    event.dataTransfer.effectAllowed = "move";
  };

  const handleTabDragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    if (!event.dataTransfer.types.includes(DND_MIME_TAB)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    // 中线判定：落点在左半 → 插到本位之前，否则之后
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    showIndicator(after ? index + 1 : index);
  };

  const handleContainerDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(DND_MIME_TAB)) return;
    event.preventDefault();
    // 空白区（标签末尾之后）= 追加到末尾
    showIndicator(openTabIds.length);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    hideIndicator();
    const raw = event.dataTransfer.getData(DND_MIME_TAB);
    if (!raw) return;
    let payload: DragPayload;
    try {
      payload = JSON.parse(raw) as DragPayload;
    } catch {
      return;
    }
    captureFlipRects();
    // 以指示线位置为插入位（指示线 left 已按中线判定更新）
    const strip = stripRef.current;
    const tabs = strip ? Array.from(strip.querySelectorAll<HTMLElement>("[data-tab-id]")) : [];
    const containerRect = strip?.getBoundingClientRect();
    const dropX = event.clientX;
    let insertIndex = openTabIds.length;
    if (strip && containerRect) {
      insertIndex = tabs.length;
      for (let i = 0; i < tabs.length; i += 1) {
        const rect = tabs[i].getBoundingClientRect();
        if (dropX < rect.left + rect.width / 2) {
          insertIndex = i;
          break;
        }
      }
    }
    applyDrop(payload, insertIndex);
  };

  return (
    <div
      className="surface-blur relative flex h-8 flex-shrink-0 items-stretch border-b border-border/60"
      onDragOver={handleContainerDragOver}
      onDrop={handleDrop}
      onDragLeave={(event) => {
        // 离开标签栏时收起指示线；子元素间移动会触发，仅在真正离场时隐藏
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          hideIndicator();
        }
      }}
      onDoubleClick={(event) => {
        // 双击空白区 = 新建标签（双击标签自身已被 stopPropagation）
        if (event.target === event.currentTarget || (event.target as HTMLElement).dataset.tabStripBlank === "true") {
          setNewSessionModalOpen(true);
        }
      }}
    >
      {/* 溢出横向滚动；右缘渐隐提示可滚（macos-hig 8.3） */}
      <div
        ref={stripRef}
        data-tab-strip-blank="true"
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)] [-ms-overflow-style:none]"
      >
        {openTabIds.map((tabId, index) => {
          const session = sessionOf(tabId);
          const active = tabId === activeTabId;
          return (
            <ContextMenu key={`${tabId}-${index}`}>
              <ContextMenuTrigger asChild>
                <div
                  data-tab-id={tabId}
                  role="tab"
                  aria-selected={active}
                  tabIndex={0}
                  draggable={!renamingId}
                  onClick={() => {
                    setActivePane(paneId);
                    setActiveTab(tabId);
                  }}
                  onAuxClick={(event) => {
                    // 中键 = 关闭（macos-hig 8.4）
                    if (event.button === 1) {
                      event.preventDefault();
                      closeTab(tabId, paneId);
                    }
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    startRename(tabId);
                  }}
                  onDragStart={(event) => handleTabDragStart(event, tabId)}
                  onDragOver={(event) => handleTabDragOver(event, index)}
                  onDragEnd={hideIndicator}
                  style={{
                    flexGrow: active ? 1.2 : 1,
                    flexBasis: 0,
                    minWidth: TAB_MIN_WIDTH,
                    maxWidth: TAB_MAX_WIDTH,
                  }}
                  className={`group/tab flex h-8 cursor-default items-center gap-1.5 overflow-hidden border-l border-border/40 px-2 transition-colors first:border-l-0 ${
                    active
                      ? "bg-background text-foreground"
                      : "text-foreground/70 hover:bg-accent/50"
                  }`}
                >
                  {renamingId === tabId ? (
                    <input
                      autoFocus
                      value={renamingValue}
                      onChange={(event) => setRenamingValue(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={handleRenameKeyDown}
                      className="h-5 w-full min-w-0 rounded-xs border border-ring bg-background px-1 text-xs outline-none"
                      aria-label={t("tabs.rename")}
                    />
                  ) : (
                    <TabFace
                      session={session}
                      active={active}
                      onClose={() => closeTab(tabId, paneId)}
                      closeLabel={t("tabs.close")}
                    />
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => splitPane(tabId, "right")}>
                  {t("tabs.splitRight")}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => closeTab(tabId, paneId)}>
                  {t("tabs.close")}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => closeOtherTabs(tabId)}>
                  {t("tabs.closeOthers")}
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => closeTabsToRight(tabId)}>
                  {t("tabs.closeRight")}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => closeAllTabs()}>
                  {t("tabs.closeAll")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      {/* 末端常驻新建按钮（ghost，macos-hig 8.1） */}
      <button
        type="button"
        aria-label={t("tabs.newTab")}
        title={t("tabs.newTab")}
        onClick={() => setNewSessionModalOpen(true)}
        className="flex w-7 flex-shrink-0 items-center justify-center text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* 插入指示线（2px，直改 DOM） */}
      <div
        ref={indicatorRef}
        aria-hidden
        className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 -translate-x-1/2 bg-primary opacity-0 transition-opacity duration-100"
      />
    </div>
  );
}
