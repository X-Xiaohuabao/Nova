/**
 * 平台与快捷键展示工具（权威规范：doc/design-ui-patterns.md 第 3.3 节）。
 *
 * 键位以 "Ctrl+Shift+T" 风格统一存储（平台无关）；显示一律经 formatShortcut，
 * 禁止硬编码 "Ctrl"/"⌘" 字面量。
 */

export type Platform = "macos" | "windows" | "linux";

/** 当前平台（编码时落此唯一实现） */
export function getPlatform(): Platform {
  const p = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
  if (p.includes("mac")) return "macos";
  if (p.includes("win")) return "windows";
  return "linux";
}

/**
 * 键位绑定 → 平台惯例显示串。
 * 修饰键映射（存储语义 → macOS / Windows·Linux）：
 * - Ctrl / Cmd（主修饰键）→ ⌘ / Ctrl
 * - Control（次级修饰键）→ ⌃ / Ctrl
 * - Alt → ⌥ / Alt；Shift → ⇧ / ⇧
 */
export function formatShortcut(binding: string): string {
  const parts = binding.split("+").filter(Boolean);
  const key = parts.pop() ?? "";
  const lower = new Set(parts.map((p) => p.toLowerCase()));
  const hasMain = lower.has("ctrl") || lower.has("cmd") || lower.has("meta");
  const hasSecondaryCtrl = lower.has("control");
  const hasAlt = lower.has("alt");
  const hasShift = lower.has("shift");

  if (getPlatform() === "macos") {
    let prefix = "";
    if (hasSecondaryCtrl) prefix += "⌃";
    if (hasAlt) prefix += "⌥";
    if (hasShift) prefix += "⇧";
    if (hasMain) prefix += "⌘";
    return `${prefix}${key}`;
  }

  let prefix = "";
  if (hasMain || hasSecondaryCtrl) prefix += "Ctrl+";
  if (hasAlt) prefix += "Alt+";
  if (hasShift) prefix += "Shift+";
  return `${prefix}${key}`;
}
