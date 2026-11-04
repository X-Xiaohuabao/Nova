/**
 * 关于页（新骨架，G14）。
 *
 * 应用标识（logo/版本/通道）、系统信息（navigator）、技术栈标签、链接。
 */

import { useTranslation } from "react-i18next";
import { Heart, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";
import SettingsCard from "./SettingsCard";

const TECH_STACK = ["Tauri 2.x", "Rust", "React 19", "TypeScript", "shadcn/ui", "TailwindCSS 4", "xterm.js", "SQLite"];

export default function AboutNext() {
  const { t } = useTranslation();

  return (
    <div>
      {/* 应用标识 */}
      <div className="flex flex-col items-center gap-1 py-8 text-center">
        <img src="/logo.png" alt="Nova" width={72} height={72} className="mb-3 rounded-2xl" />
        <h3 className="text-[15px] font-semibold">Nova</h3>
        <p className="text-[13px] text-muted-foreground">{t("settings.about.tagline")}</p>
        <div className="mt-1 flex gap-1.5">
          <Badge variant="secondary">v0.1.1</Badge>
          <Badge variant="outline">MVP</Badge>
        </div>
      </div>

      <Separator />

      <SectionHeader title={t("settings.about.appInfo")} />
      <SettingsCard>
      <SettingRow id="settings.appName" label={t("settings.about.appName")}>
        <span className="text-[13px] text-foreground/85">Nova</span>
      </SettingRow>
      <SettingRow id="settings.version" label={t("settings.about.version")}>
        <span className="text-[13px] text-foreground/85">v0.1.1</span>
      </SettingRow>
      <SettingRow id="settings.channel" label={t("settings.about.channel")} description={t("settings.about.channelDesc")}>
        <Badge variant="secondary">{t("settings.about.channelStable")}</Badge>
      </SettingRow>

            </SettingsCard>

<SectionHeader title={t("settings.about.system")} />
      <SettingsCard>
      <SettingRow id="settings.os" label={t("settings.about.os")}>
        <span className="text-[13px] text-muted-foreground">{navigator.platform}</span>
      </SettingRow>
      <SettingRow id="settings.arch" label={t("settings.about.arch")}>
        <span className="text-[13px] text-muted-foreground">
          {navigator.userAgent.includes("x86_64") || navigator.userAgent.includes("x64") ? "x64" : "arm64"}
        </span>
      </SettingRow>
      <SettingRow id="settings.tauriVersion" label={t("settings.about.tauriVersion")}>
        <span className="text-[13px] text-muted-foreground">2.x</span>
      </SettingRow>

            </SettingsCard>

<SectionHeader title={t("settings.about.stack")} />
      <SettingsCard>
      <div className="flex flex-wrap gap-1.5 py-2">
        {TECH_STACK.map((tech) => (
          <Badge key={tech} variant="outline" className="font-normal">{tech}</Badge>
        ))}
      </div>

            </SettingsCard>

<SectionHeader title={t("settings.about.links")} />
      <SettingsCard>
        <div className="py-2">
          <a
            href="https://github.com/X-Xiaohuabao/Nova"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline"
          >
            <GitBranch size={14} />
            GitHub
          </a>
        </div>
      </SettingsCard>

      <Separator />
      <div className="flex flex-col items-center gap-0.5 py-4 text-center text-xs text-muted-foreground/70">
        <p className="m-0 inline-flex items-center gap-1">
          <Heart size={12} className="text-destructive" />
          {t("settings.about.madeWithLove")}
        </p>
        <p className="m-0">MIT License</p>
      </div>
    </div>
  );
}
