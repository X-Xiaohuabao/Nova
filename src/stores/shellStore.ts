/**
 * 壳层 UI 偏好 store（侧栏折叠态与展开宽度）。
 *
 * 仅存 UI 偏好（persist 落 localStorage）；业务数据一律走 Rust 侧，见 zustand-state 技能。
 * 宽度约束按 macos-hig 侧栏基准：200px 标准档，拖拽 200~320px。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SIDEBAR_COLLAPSED_WIDTH = 56;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 320;
export const SIDEBAR_DEFAULT_WIDTH = 200;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

interface ShellState {
  /** 桌面侧栏是否折叠（收为图标窄条） */
  sidebarCollapsed: boolean;
  /** 桌面侧栏展开宽度（px，200~320） */
  sidebarWidth: number;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
}

const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setSidebarWidth: (width) => set({ sidebarWidth: clampSidebarWidth(width) }),
    }),
    {
      name: "teacoder-shell-ui",
      version: 1,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarWidth: state.sidebarWidth,
      }),
      // 宽度越界（如未来基准调整）时回收默认档
      merge: (persisted, current) => {
        const saved = persisted as
          | { sidebarCollapsed?: unknown; sidebarWidth?: unknown }
          | undefined;
        return {
          ...current,
          sidebarCollapsed:
            typeof saved?.sidebarCollapsed === "boolean"
              ? saved.sidebarCollapsed
              : current.sidebarCollapsed,
          sidebarWidth:
            typeof saved?.sidebarWidth === "number"
              ? clampSidebarWidth(saved.sidebarWidth)
              : current.sidebarWidth,
        };
      },
    },
  ),
);

export { useShellStore as shellStore };
