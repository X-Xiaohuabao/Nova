import { useEffect, useRef } from "react";
import { useAppStore } from "../stores/appStore";
import { runtimeKind } from "@/lib/bridge";

/**
 * 全局键盘快捷键（权威键位表：doc/design-ui-patterns.md 第 3 章）。
 *
 * ⌘T 新建 / ⌘W 关闭当前 / ⌘⇧[ ⌘⇧]（⌘⇧Tab 同义）前后切换 / ⌘1~9 直达 / ⌘P 搜索。
 * 与浏览器行为冲突的桌面专属键（⌘T/⌘W/⌘P/⌘1~9）仅在 tauri-desktop 运行时注册，
 * web-remote 下浏览器行为优先（规范 3.4）。
 */
export default function useKeyboardShortcuts() {
  const closeTab = useAppStore((s) => s.closeTab);
  const openTabIds = useAppStore((s) => s.openTabIds);
  const panes = useAppStore((s) => s.panes);
  const activePaneId = useAppStore((s) => s.activePaneId);
  const sessions = useAppStore((s) => s.sessions);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const setModalOpen = useAppStore((s) => s.setNewSessionModalOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);

  const openTabIdsRef = useRef(openTabIds);
  openTabIdsRef.current = openTabIds;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const panesRef = useRef(panes);
  panesRef.current = panes;
  const activePaneIdRef = useRef(activePaneId);
  activePaneIdRef.current = activePaneId;

  useEffect(() => {
    const desktopOnly = runtimeKind() === "tauri-desktop";

    /** 当前 pane 内按步进切换标签（+1 后一个 / -1 前一个） */
    const cycleTab = (dir: 1 | -1) => {
      const currentIds = openTabIdsRef.current;
      if (currentIds.length === 0) return;
      const currentIdx = currentIds.indexOf(activeTabIdRef.current || "");
      const nextIdx = (currentIdx + dir + currentIds.length) % currentIds.length;
      setActiveTab(currentIds[nextIdx]);
    };

    /** 直达当前 pane 第 n 个标签（1 基） */
    const focusTabIndex = (n: number) => {
      const pane = panesRef.current.find((p) => p.id === activePaneIdRef.current);
      const ids = pane?.openTabIds ?? [];
      const target = ids[n - 1];
      if (!target || !pane) return;
      setActivePane(pane.id);
      setActiveTab(target);
    };

    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "t" && desktopOnly) {
        e.preventDefault();
        setModalOpen(true);
        return;
      }

      if (ctrl && e.key === "w" && desktopOnly) {
        e.preventDefault();
        const tabId = activeTabIdRef.current;
        if (!tabId) return;
        closeTab(tabId);
        return;
      }

      // ⌘⇧[ / ⌘⇧] 与 ⌘⇧Tab 同义：前后切换
      if (ctrl && e.key === "[") {
        e.preventDefault();
        cycleTab(-1);
        return;
      }

      if (ctrl && e.key === "]") {
        e.preventDefault();
        cycleTab(1);
        return;
      }

      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        cycleTab(e.shiftKey ? -1 : 1);
        return;
      }

      if (ctrl && /^[1-9]$/.test(e.key) && desktopOnly) {
        e.preventDefault();
        focusTabIndex(Number(e.key));
        return;
      }

      if (ctrl && e.key === "p" && desktopOnly) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [closeTab, setActiveTab, setActivePane, setModalOpen, setSearchOpen]);
}
