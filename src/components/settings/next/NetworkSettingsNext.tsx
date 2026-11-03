/**
 * 网络设置页（新骨架，G5）。
 *
 * 代理（类型/地址/认证，启用后逐级展开）与连接（超时/重试/SSL），
 * 持久化 localStorage「teacoder_network_settings」，与旧页同键兼容。
 */

import { useTranslation } from "react-i18next";
import { useLocalStorageSettings } from "./useLocalStorageSettings";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";

interface NetworkSettings {
  enableProxy: boolean;
  proxyType: string;
  proxyAddress: string;
  proxyAuth: boolean;
  proxyUsername: string;
  proxyPassword: string;
  connectionTimeout: number;
  retryCount: number;
  sslVerify: boolean;
}

const DEFAULTS: NetworkSettings = {
  enableProxy: false,
  proxyType: "http",
  proxyAddress: "",
  proxyAuth: false,
  proxyUsername: "",
  proxyPassword: "",
  connectionTimeout: 30,
  retryCount: 3,
  sslVerify: true,
};

export default function NetworkSettingsNext() {
  const { t } = useTranslation();
  const [settings, update] = useLocalStorageSettings<NetworkSettings>("teacoder_network_settings", DEFAULTS);

  return (
    <div>
      <SectionHeader title={t("settings.net.proxy")} />
      <SettingRow id="settings.enableProxy" label={t("settings.net.enableProxy")} description={t("settings.net.enableProxyDesc")}>
        <Switch checked={settings.enableProxy} onCheckedChange={(v) => update({ enableProxy: v })} />
      </SettingRow>
      {settings.enableProxy && (
        <>
          <SettingRow id="settings.proxyType" label={t("settings.net.proxyType")} description={t("settings.net.proxyTypeDesc")}>
            <Select value={settings.proxyType} onValueChange={(v) => update({ proxyType: v })}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="socks5">SOCKS5</SelectItem>
                <SelectItem value="system">{t("settings.net.proxySystem")}</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow id="settings.proxyAddress" label={t("settings.net.proxyAddress")} description={t("settings.net.proxyAddressDesc")}>
            <Input
              className="w-56"
              value={settings.proxyAddress}
              onChange={(e) => update({ proxyAddress: e.target.value })}
              placeholder="127.0.0.1:7890"
            />
          </SettingRow>
          <SettingRow id="settings.proxyAuth" label={t("settings.net.proxyAuth")} description={t("settings.net.proxyAuthDesc")}>
            <Switch checked={settings.proxyAuth} onCheckedChange={(v) => update({ proxyAuth: v })} />
          </SettingRow>
          {settings.proxyAuth && (
            <>
              <SettingRow id="settings.proxyUsername" label={t("settings.net.proxyUsername")}>
                <Input
                  className="w-56"
                  value={settings.proxyUsername}
                  onChange={(e) => update({ proxyUsername: e.target.value })}
                  placeholder="username"
                />
              </SettingRow>
              <SettingRow id="settings.proxyPassword" label={t("settings.net.proxyPassword")}>
                <Input
                  className="w-56"
                  type="password"
                  value={settings.proxyPassword}
                  onChange={(e) => update({ proxyPassword: e.target.value })}
                  placeholder="password"
                />
              </SettingRow>
            </>
          )}
        </>
      )}

      <SectionHeader title={t("settings.net.connection")} />
      <SettingRow id="settings.connectionTimeout" label={t("settings.net.timeout")} description={t("settings.net.timeoutDesc")}>
        <div className="flex items-center gap-1.5">
          <Input
            className="w-20"
            type="number"
            min={5}
            max={120}
            value={settings.connectionTimeout}
            onChange={(e) => update({ connectionTimeout: Number(e.target.value) || 30 })}
          />
          <span className="text-xs text-muted-foreground">{t("settings.net.seconds")}</span>
        </div>
      </SettingRow>
      <SettingRow id="settings.retryCount" label={t("settings.net.retries")} description={t("settings.net.retriesDesc")}>
        <Input
          className="w-20"
          type="number"
          min={0}
          max={10}
          value={settings.retryCount}
          onChange={(e) => update({ retryCount: Number(e.target.value) || 0 })}
        />
      </SettingRow>
      <SettingRow id="settings.sslVerify" label={t("settings.net.sslVerify")} description={t("settings.net.sslVerifyDesc")}>
        <Switch checked={settings.sslVerify} onCheckedChange={(v) => update({ sslVerify: v })} />
      </SettingRow>
    </div>
  );
}
