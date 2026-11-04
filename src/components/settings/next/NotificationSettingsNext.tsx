/**
 * 桌面通知设置页（新骨架，G6）。
 *
 * 通知方式与通知事件开关，持久化 localStorage「nova_notification_settings」。
 */

import { useTranslation } from "react-i18next";
import { useLocalStorageSettings } from "./useLocalStorageSettings";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";
import SettingsCard from "./SettingsCard";

interface NotificationSettings {
  enableDesktop: boolean;
  enableSound: boolean;
  sessionComplete: boolean;
  errorOccur: boolean;
  costWarning: boolean;
  costWarningThreshold: number;
  versionUpdate: boolean;
}

const DEFAULTS: NotificationSettings = {
  enableDesktop: true,
  enableSound: false,
  sessionComplete: true,
  errorOccur: true,
  costWarning: true,
  costWarningThreshold: 10,
  versionUpdate: true,
};

export default function NotificationSettingsNext() {
  const { t } = useTranslation();
  const [settings, update] = useLocalStorageSettings<NotificationSettings>("nova_notification_settings", DEFAULTS);

  return (
    <div>
      <SectionHeader title={t("settings.notif.channels")} />
      <SettingsCard>
      <SettingRow id="settings.enableDesktop" label={t("settings.notif.desktop")} description={t("settings.notif.desktopDesc")}>
        <Switch checked={settings.enableDesktop} onCheckedChange={(v) => update({ enableDesktop: v })} />
      </SettingRow>
      <SettingRow id="settings.enableSound" label={t("settings.notif.sound")} description={t("settings.notif.soundDesc")}>
        <Switch checked={settings.enableSound} onCheckedChange={(v) => update({ enableSound: v })} />
      </SettingRow>

            </SettingsCard>

<SectionHeader title={t("settings.notif.events")} />
      <SettingsCard>
      <SettingRow id="settings.sessionComplete" label={t("settings.notif.sessionComplete")} description={t("settings.notif.sessionCompleteDesc")}>
        <Switch checked={settings.sessionComplete} onCheckedChange={(v) => update({ sessionComplete: v })} />
      </SettingRow>
      <SettingRow id="settings.errorOccur" label={t("settings.notif.errorOccur")} description={t("settings.notif.errorOccurDesc")}>
        <Switch checked={settings.errorOccur} onCheckedChange={(v) => update({ errorOccur: v })} />
      </SettingRow>
      <SettingRow id="settings.costWarning" label={t("settings.notif.costWarning")} description={t("settings.notif.costWarningDesc")}>
        <Switch checked={settings.costWarning} onCheckedChange={(v) => update({ costWarning: v })} />
      </SettingRow>
      {settings.costWarning && (
        <SettingRow id="settings.costWarningThreshold" label={t("settings.notif.threshold")} description={t("settings.notif.thresholdDesc")}>
          <div className="flex items-center gap-1.5">
            <Input
              className="w-20"
              type="number"
              min={1}
              max={1000}
              value={settings.costWarningThreshold}
              onChange={(e) => update({ costWarningThreshold: Number(e.target.value) || 10 })}
            />
            <span className="text-xs text-muted-foreground">USD</span>
          </div>
        </SettingRow>
      )}
      <SettingRow id="settings.versionUpdate" label={t("settings.notif.versionUpdate")} description={t("settings.notif.versionUpdateDesc")}>
        <Switch checked={settings.versionUpdate} onCheckedChange={(v) => update({ versionUpdate: v })} />
      </SettingRow>
      </SettingsCard>
    </div>
  );
}
