/**
 * 三态主题 store（浅色 / 深色 / 跟随系统）。
 *
 * - 模式持久化走 zustand persist（localStorage，UI 偏好不落业务库）
 * - 「跟随系统」经 prefers-color-scheme 探测 + change 监听即时跟随
 * - 生效方式：documentElement 挂 light/dark class，语义 token 见 src/styles/tokens.css
 * - 首次运行无新 key 时，从旧主题 key（teacoder_general_settings.theme）归一迁移，
 *   映射规则见 src/themes/legacy.ts
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { normalizeLegacyTheme } from "@/themes/legacy";

export type ThemeMode = "light" | "dark" | "system";
export type ConcreteTheme = "light" | "dark";

const STORAGE_KEY = "teacoder-theme-mode";
const LEGACY_SETTINGS_KEY = "teacoder_general_settings";

const prefersDark = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-color-scheme: dark)").matches;

/** 模式 → 具体明暗（system 态探测当前系统偏好） */
export function resolveConcreteTheme(mode: ThemeMode): ConcreteTheme {
  if (mode === "system") {
    return prefersDark() ? "dark" : "light";
  }
  return mode;
}

/** 首次运行初始模式：新 key → 旧 key 归一 → 默认深色（macOS 默认观感） */
function resolveInitialMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    const mode = parsed?.state?.mode;
    if (mode === "light" || mode === "dark" || mode === "system") {
      return mode;
    }
  } catch {
    // 损坏的持久化值按无处理
  }
  try {
    const raw = localStorage.getItem(LEGACY_SETTINGS_KEY);
    const legacy = raw ? JSON.parse(raw) : {};
    if (legacy.theme === "system") {
      return "system";
    }
    if (typeof legacy.theme === "string") {
      return normalizeLegacyTheme(legacy.theme);
    }
  } catch {
    // 旧值损坏按无处理
  }
  return "dark";
}

interface ThemeState {
  /** 用户选择的三态模式 */
  mode: ThemeMode;
  /** 当前实际生效的明暗档（system 态随系统变化） */
  resolved: ConcreteTheme;
  /** 切换模式：即时生效并持久化 */
  setMode: (mode: ThemeMode) => void;
}

const initialMode = resolveInitialMode();

const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: initialMode,
      resolved: resolveConcreteTheme(initialMode),
      setMode: (mode) => {
        set({ mode, resolved: resolveConcreteTheme(mode) });
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ mode: state.mode }),
      // 合并时校验持久化值并重算 resolved，避免档位与实际生效档位脱节
      merge: (persisted, current) => {
        const saved = persisted as { mode?: unknown } | undefined;
        const mode =
          saved?.mode === "light" ||
          saved?.mode === "dark" ||
          saved?.mode === "system"
            ? saved.mode
            : current.mode;
        return { ...current, mode, resolved: resolveConcreteTheme(mode) };
      },
    },
  ),
);

/** 把 resolved 档应用到 documentElement class（tokens.css 以 class 切换变量集） */
function applyThemeClass(resolved: ConcreteTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("light", resolved === "light");
}

let systemListenerBound = false;

/**
 * 应用启动时调用（幂等）：立即应用当前档位，并绑定系统主题变化监听。
 * 跟随系统模式下系统明暗切换即时生效；store 任何变更后重新调用亦可安全复用。
 */
export function initTheme(): void {
  const { resolved } = useThemeStore.getState();
  applyThemeClass(resolved);

  if (!systemListenerBound && typeof window !== "undefined") {
    systemListenerBound = true;
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        const state = useThemeStore.getState();
        if (state.mode === "system") {
          const next = resolveConcreteTheme("system");
          useThemeStore.setState({ resolved: next });
          applyThemeClass(next);
        }
      });
  }
}

// rehydrate 后同步（持久化值与初始值不一致时兜底）
useThemeStore.subscribe((state) => applyThemeClass(state.resolved));

export { useThemeStore as themeStore };
