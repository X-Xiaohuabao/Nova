/**
 * 远程访问设置面板（新骨架，G11 / RA5）。
 *
 * 服务开关（remote_set_config 联动启停）/ 端口 / 配对码与倒计时（5 分钟，
 * 可重新生成）/ 服务状态 / 连接地址提示。红线：默认关闭、显式开启、
 * 强制配对鉴权（RA4）；凭据类命令永不入远程白名单。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { remoteGetConfig, remoteSetConfig, remoteGetPairingCode } from "@/utils/ipc";
import type { RemotePairingCode } from "@/utils/ipc";
import type { RemoteAccessConfig } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RefreshCw } from "lucide-react";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";
import SettingsCard from "./SettingsCard";

/** 连接地址提示：局域网 IP 需用户在本机查询（前端取不到多网卡真实 IP） */
function lanAddressHint(port: number): string {
  return `ws://<${"LAN-IP"}>:${port}`;
}

export default function RemoteAccessNext() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<RemoteAccessConfig | null>(null);
  const [pairing, setPairing] = useState<RemotePairingCode | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    remoteGetConfig()
      .then(setConfig)
      .catch(() => toast.error(t("settings.remote.loadFailed")));
  }, [t]);

  // 配对码加载与倒计时
  useEffect(() => {
    if (!config?.enabled) return;
    const load = () =>
      remoteGetPairingCode()
        .then((code) => {
          setPairing(code);
          setRemaining(code.expiresInSecs);
        })
        .catch(() => {
          // 配对码拉取失败不阻塞面板
        });
    void load();
    const timer = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          void load();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [config?.enabled]);

  const persist = async (next: RemoteAccessConfig) => {
    setConfig(next);
    try {
      await remoteSetConfig(next);
      toast.success(t("settings.saved"));
    } catch {
      toast.error(t("settings.saveFailed"));
    }
  };

  if (!config) {
    return (
      <div className="py-10 text-center text-xs text-muted-foreground/60">
        {t("settings.remote.loadFailed")}
      </div>
    );
  }

  return (
    <div>
      <SectionHeader title={t("settings.remote.service")} />
      <SettingsCard>
      <SettingRow
        id="settings.remote.enabled"
        label={t("settings.remote.enabled")}
        description={t("settings.remote.enabledDesc")}
      >
        <div className="flex items-center gap-2">
          <Badge variant={config.enabled ? "secondary" : "outline"}>
            {config.enabled ? t("settings.remote.statusOn") : t("settings.remote.statusOff")}
          </Badge>
          <Switch
            checked={config.enabled}
            onCheckedChange={(enabled) => void persist({ ...config, enabled })}
          />
        </div>
      </SettingRow>
      <SettingRow
        id="settings.remote.port"
        label={t("settings.remote.port")}
        description={t("settings.remote.portDesc")}
      >
        <Input
          className="w-24"
          type="number"
          min={1024}
          max={65535}
          value={config.port}
          onChange={(e) => setConfig({ ...config, port: Number(e.target.value) || 47001 })}
          onBlur={() => void persist(config)}
        />
      </SettingRow>

      </SettingsCard>

      {config.enabled && (
        <>
          <SectionHeader title={t("settings.remote.pairing")} />
          <SettingsCard>
          <SettingRow
            id="settings.remote.pairingCode"
            label={t("settings.remote.pairingCode")}
            description={t("settings.remote.pairingCodeDesc")}
          >
            <div className="flex items-center gap-2">
              <kbd className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-[13px] tracking-[0.3em]">
                {pairing?.code ?? "······"}
              </kbd>
              <span className="w-10 text-right text-xs text-muted-foreground">
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("settings.remote.regenerate")}
                onClick={() =>
                  remoteGetPairingCode()
                    .then((code) => {
                      setPairing(code);
                      setRemaining(code.expiresInSecs);
                    })
                    .catch(() => toast.error(t("settings.remote.loadFailed")))
                }
              >
                <RefreshCw size={14} />
              </Button>
            </div>
          </SettingRow>
          <SettingRow
            id="settings.remote.address"
            label={t("settings.remote.address")}
            description={t("settings.remote.addressDesc")}
          >
            <span className="font-mono text-xs text-muted-foreground">{lanAddressHint(config.port)}</span>
          </SettingRow>
          </SettingsCard>
        </>
      )}
    </div>
  );
}
