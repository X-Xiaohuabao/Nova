/**
 * i18n 初始化（react-i18next 单实例）。
 *
 * 语言决策链：localStorage 显式值 → navigator.language（zh* → zh-CN）→ 默认 en/zh。
 * 回退语言 zh-CN。切换走 changeLanguage()：即时生效 + 持久化 + html lang 同步。
 * 资源按命名空间组织（common/shell/chat），迁移模块时增补对应键组。
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

export const SUPPORTED_LANGUAGES = ["zh-CN", "en-US"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = "teacoder_language";
const FALLBACK_LANGUAGE: Language = "zh-CN";

function isLanguage(value: string | null): value is Language {
  return value === "zh-CN" || value === "en-US";
}

/** 语言决策链：显式存储 → 系统语言 → 缺省 */
function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // localStorage 不可用时继续走检测
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "";
  return nav.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}

void i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { translation: zhCN },
    "en-US": { translation: enUS },
  },
  lng: detectLanguage(),
  fallbackLng: FALLBACK_LANGUAGE,
  // React 已防 XSS，关闭插值转义
  interpolation: { escapeValue: false },
});

/** 切换语言：即时生效 + 持久化 + html lang 同步 */
export function changeLanguage(lang: Language): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // 持久化失败不阻塞切换
  }
  document.documentElement.lang = lang;
}

/** 重置为跟随系统：清除显式偏好，按决策链重新检测（I3 语言三态用） */
export function resetLanguageToSystem(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 清除失败不阻塞
  }
  const detected = detectLanguage();
  void i18n.changeLanguage(detected);
  document.documentElement.lang = detected;
}

// 首次加载同步 html lang 属性
document.documentElement.lang = i18n.language;

export default i18n;
