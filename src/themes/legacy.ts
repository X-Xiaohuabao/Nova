/**
 * 旧主题 key 归一映射。
 *
 * 旧 UI（AntD ConfigProvider 时期）的 theme 是 BUILT_IN_THEMES 里的 13 套 key
 * （system/dark/light/one-dark/monokai/warm-light 等），持久化在
 * localStorage「nova_general_settings」的 theme 字段。
 * 新骨架只有 light/dark/system 三态（语义 token 见 src/styles/tokens.css），
 * 迁移时按旧主题表 algorithm 把暗色系归一为 dark、浅色系归一为 light；
 * 「system」由调用方单独映射为三态里的 system。
 * 旧主题表拆除（T15）后本模块可一并移除。
 */

import { BUILT_IN_THEMES } from "./index";

/** 旧主题 key → 新语义档（不含 system：跟随系统语义由三态层处理） */
const LEGACY_KEY_TO_CONCRETE = new Map<string, "light" | "dark">(
  BUILT_IN_THEMES.filter((theme) => theme.key !== "system").map((theme) => [
    theme.key,
    theme.algorithm === "dark" ? "dark" : "light",
  ]),
);

/**
 * 旧主题 key 归一为 light/dark。
 * 表内 key 按算法归档；表外 key 按命名约定兜底（含 "dark" 视为暗色）。
 */
export function normalizeLegacyTheme(key: string): "light" | "dark" {
  const mapped = LEGACY_KEY_TO_CONCRETE.get(key);
  if (mapped) {
    return mapped;
  }
  return key.toLowerCase().includes("dark") ? "dark" : "light";
}
