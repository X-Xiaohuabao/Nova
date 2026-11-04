/**
 * 通用设置页（新骨架，G1）。
 *
 * 语言三态（I3：跟随系统 / 简体中文 / English，即时生效重启保持）、
 * 主题三态（themeStore）、界面缩放与界面字体（appStore 偏好，即时生效）。
 * 文案走 i18n（settings 命名空间）。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  changeLanguage,
  resetLanguageToSystem,
  SUPPORTED_LANGUAGES,
} from "@/i18n";
import type { Language } from "@/i18n";
import { listSystemFonts } from "@/utils/ipc";
import { themeStore } from "@/stores/themeStore";
import type { ThemeMode } from "@/stores/themeStore";
import { useAppStore } from "@/stores/appStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";
import SettingsCard from "./SettingsCard";

/** 语言偏好三态（跟随系统 / 具体语言） */
type LanguagePref = "system" | Language;

const LANG_STORAGE_KEY = "nova_language";

function readLanguagePref(): LanguagePref {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === "zh-CN" || stored === "en-US") return stored;
  } catch {
    // 不可用时按跟随系统
  }
  return "system";
}

interface GeneralSettingsNextProps {
  /** 搜索定位高亮的行锚点 */
  highlightKey?: string;
}

export default function GeneralSettingsNext({ highlightKey }: GeneralSettingsNextProps) {
  const { t } = useTranslation();
  const [langPref, setLangPref] = useState<LanguagePref>(readLanguagePref);
  const mode = themeStore((s) => s.mode);
  const uiZoom = useAppStore((s) => s.uiZoom);
  const setUiZoom = useAppStore((s) => s.setUiZoom);
  const uiFontFamily = useAppStore((s) => s.uiFontFamily);
  const setUiFontFamily = useAppStore((s) => s.setUiFontFamily);
  const [fonts, setFonts] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    listSystemFonts()
      .then((list) => {
        if (!cancelled) setFonts(list);
      })
      .catch(() => {
        // 字体枚举失败保持空列表（Select 回落系统默认）
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyLanguagePref = (pref: LanguagePref) => {
    setLangPref(pref);
    if (pref === "system") {
      resetLanguageToSystem();
    } else {
      changeLanguage(pref);
    }
  };

  return (
    <div>
      <SectionHeader title={t("settings.appearance")} />
      <SettingsCard>
      <SettingRow
        id="settings.theme"
        label={t("settings.theme")}
        description={t("settings.themeDesc")}
        highlight={highlightKey === "settings.theme"}
      >
        <Select value={mode} onValueChange={(value) => themeStore.getState().setMode(value as ThemeMode)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t("theme.system")}</SelectItem>
            <SelectItem value="light">{t("theme.light")}</SelectItem>
            <SelectItem value="dark">{t("theme.dark")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <SettingRow
        id="settings.uiZoom"
        label={t("settings.uiZoom")}
        highlight={highlightKey === "settings.uiZoom"}
      >
        <div className="flex w-48 items-center gap-3">
          <Slider
            value={[uiZoom]}
            min={50}
            max={150}
            step={5}
            onValueChange={([value]) => setUiZoom(value)}
          />
          <span className="w-10 text-right text-xs text-muted-foreground">{uiZoom}%</span>
        </div>
      </SettingRow>
      <SettingRow
        id="settings.uiFont"
        label={t("settings.uiFont")}
        highlight={highlightKey === "settings.uiFont"}
      >
        <Select value={uiFontFamily} onValueChange={setUiFontFamily}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="system-ui">{t("settings.fontSystemDefault")}</SelectItem>
            {fonts.map((font) => (
              <SelectItem key={font} value={font}>{font}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      </SettingsCard>

      <SectionHeader title={t("settings.language")} />
      <SettingsCard>
      <SettingRow
        id="settings.language"
        label={t("settings.language")}
        description={t("settings.languageDesc")}
        highlight={highlightKey === "settings.language"}
      >
        <Select value={langPref} onValueChange={(value) => applyLanguagePref(value as LanguagePref)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t("settings.languageSystem")}</SelectItem>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {lang === "zh-CN" ? t("settings.langZh") : t("settings.langEn")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingRow>
      </SettingsCard>
    </div>
  );
}
