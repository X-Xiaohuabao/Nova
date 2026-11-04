/**
 * 全局快捷键设置页（新骨架，G4）。
 *
 * 仅系统级全局键可自定义（design-ui-patterns 3.2）；应用内固定键位只读展示。
 * 展示一律经 formatShortcut 平台化；存储键位沿用旧 localStorage 键。
 */

import { useTranslation } from "react-i18next";
import { useLocalStorageSettings } from "./useLocalStorageSettings";
import { formatShortcut } from "@/lib/shortcut";
import KeyCaptureInput from "./KeyCaptureInput";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";
import SettingsCard from "./SettingsCard";

interface KeybindingsSettings {
  showHideWindow: string;
  newSession: string;
  closeSession: string;
  terminalCopy: string;
  terminalPaste: string;
  terminalClear: string;
  terminalSearch: string;
  editUndo: string;
  editRedo: string;
}

const DEFAULTS: KeybindingsSettings = {
  showHideWindow: "Ctrl+Shift+T",
  newSession: "Ctrl+N",
  closeSession: "Ctrl+W",
  terminalCopy: "Ctrl+Shift+C",
  terminalPaste: "Ctrl+Shift+V",
  terminalClear: "Ctrl+L",
  terminalSearch: "Ctrl+Shift+F",
  editUndo: "Ctrl+Z",
  editRedo: "Ctrl+Shift+Z",
};

/** 应用内固定键位（不可自定义，只读展示） */
const FIXED_BINDINGS: { labelKey: string; binding: string }[] = [
  { labelKey: "settings.keybindings.newTab", binding: "Ctrl+T" },
  { labelKey: "settings.keybindings.closeTab", binding: "Ctrl+W" },
  { labelKey: "settings.keybindings.switchTab", binding: "Ctrl+Tab" },
  { labelKey: "settings.keybindings.focusTab", binding: "Ctrl+1" },
  { labelKey: "settings.keybindings.quickSwitch", binding: "Ctrl+P" },
  { labelKey: "settings.keybindings.openSettings", binding: "Ctrl+," },
];

export default function KeybindingsSettingsNext() {
  const { t } = useTranslation();
  const [settings, update] = useLocalStorageSettings<KeybindingsSettings>("teacoder_keybindings_settings", DEFAULTS);

  const customRow = (key: keyof KeybindingsSettings, labelKey: string, descKey: string) => (
    <SettingRow id={`settings.kb.${key}`} label={t(labelKey)} description={t(descKey)}>
      <KeyCaptureInput
        value={settings[key]}
        onChange={(value) => update({ [key]: value })}
        ariaLabel={t(labelKey)}
      />
    </SettingRow>
  );

  return (
    <div>
      <SectionHeader title={t("settings.keybindings.global")} />
      <SettingsCard>
      {customRow("showHideWindow", "settings.keybindings.showHide", "settings.keybindings.showHideDesc")}
      {customRow("newSession", "settings.keybindings.newSession", "settings.keybindings.newSessionDesc")}
      {customRow("closeSession", "settings.keybindings.closeSession", "settings.keybindings.closeSessionDesc")}

            </SettingsCard>

<SectionHeader title={t("settings.keybindings.terminal")} />
      <SettingsCard>
      {customRow("terminalCopy", "settings.keybindings.copy", "settings.keybindings.copyDesc")}
      {customRow("terminalPaste", "settings.keybindings.paste", "settings.keybindings.pasteDesc")}
      {customRow("terminalClear", "settings.keybindings.clear", "settings.keybindings.clearDesc")}
      {customRow("terminalSearch", "settings.keybindings.search", "settings.keybindings.searchDesc")}

            </SettingsCard>

<SectionHeader title={t("settings.keybindings.editing")} />
      <SettingsCard>
      {customRow("editUndo", "settings.keybindings.undo", "settings.keybindings.undoDesc")}
      {customRow("editRedo", "settings.keybindings.redo", "settings.keybindings.redoDesc")}

            </SettingsCard>

<SectionHeader title={t("settings.keybindings.inApp")} />
      <SettingsCard>
      {FIXED_BINDINGS.map(({ labelKey, binding }) => (
        <SettingRow
          key={labelKey}
          id={`settings.kb.fixed.${labelKey}`}
          label={t(labelKey)}
          description={t("settings.keybindings.fixedHint")}
        >
          <kbd className="rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
            {formatShortcut(binding)}
          </kbd>
        </SettingRow>
      ))}
      </SettingsCard>
    </div>
  );
}
