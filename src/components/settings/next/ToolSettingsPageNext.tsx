/**
 * CLI 工具设置页通用件（新骨架，G3 批量迁移用）。
 *
 * 各 CLI 设置页以字段声明配置驱动本组件：读写统一走 tool_settings IPC
 * （getToolSettings/upsertToolSettings，按 Profile 维度），顶层键
 * （model/autoSubmit/customInstructions/thinkingIntensity）直接落列，
 * 其余字段序列化进 settingsJson——与旧各页拆分逻辑一致。
 * Antigravity 的 apiKey 沿用旧存储链路（tool_settings），不落日志。
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getToolSettings, upsertToolSettings } from "@/utils/ipc";
import type { ToolSettings } from "@/types";
import { useAppStore } from "@/stores/appStore";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";
import SettingsCard from "./SettingsCard";

/** tool_settings 表顶层列（其余字段进 settingsJson） */
const TOP_KEYS = ["model", "autoSubmit", "customInstructions", "thinkingIntensity"] as const;

/** 字段控件类型 */
type FieldType = "switch" | "text" | "password" | "number" | "select" | "textarea";

interface FieldDef {
  key: string;
  /** i18n 标签键 */
  labelKey: string;
  /** i18n 描述键（可选） */
  descKey?: string;
  /** 分组标题 i18n 键 */
  groupKey: string;
  type: FieldType;
  /** select 选项（label 为 i18n 键） */
  options?: { value: string; labelKey: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** textarea/input 占位（i18n 键，可选） */
  placeholderKey?: string;
}

interface ToolSettingsPageNextProps {
  toolType: "claude" | "codex" | "gemini" | "opencode" | "antigravity";
  /** Profile 空态提示中的工具名（i18n 键或品牌名） */
  toolLabel: string;
  /** 各设置项默认值 */
  defaults: Record<string, string | number | boolean>;
  fields: FieldDef[];
  /** 附加区块（如快捷命令编辑器） */
  extra?: React.ReactNode;
}

/** 按声明顺序聚合分组（保持 fields 顺序，组按首次出现排序） */
function groupFields(fields: FieldDef[]): Map<string, FieldDef[]> {
  const groups = new Map<string, FieldDef[]>();
  for (const field of fields) {
    const list = groups.get(field.groupKey) ?? [];
    list.push(field);
    groups.set(field.groupKey, list);
  }
  return groups;
}

export default function ToolSettingsPageNext({
  toolType,
  toolLabel,
  defaults,
  fields,
  extra,
}: ToolSettingsPageNextProps) {
  const { t } = useTranslation();
  const profiles = useAppStore((s) => s.profiles);
  const activeProfile = profiles.find((p) => p.toolType === toolType);
  const [settings, setSettings] = useState<Record<string, string | number | boolean>>(defaults);

  useEffect(() => {
    if (!activeProfile) return;
    let cancelled = false;
    getToolSettings(activeProfile.id)
      .then((data: ToolSettings | null) => {
        if (cancelled || !data) return;
        // 顶层列 + settingsJson 合并，缺失回落 defaults
        let parsedExtra: Record<string, unknown> = {};
        try {
          parsedExtra = data.settingsJson
            ? (JSON.parse(data.settingsJson) as Record<string, unknown>)
            : {};
        } catch {
          parsedExtra = {};
        }
        const merged: Record<string, string | number | boolean> = { ...defaults };
        for (const field of fields) {
          const raw = (TOP_KEYS as readonly string[]).includes(field.key)
            ? (data as unknown as Record<string, unknown>)[field.key]
            : parsedExtra[field.key];
          if (raw !== undefined && raw !== null && raw !== "") {
            merged[field.key] = raw as string | number | boolean;
          }
        }
        setSettings(merged);
      })
      .catch(() => {
        toast.error(t("settings.loadFailed"));
      });
    return () => {
      cancelled = true;
    };
    // defaults/fields 由调用方以模块级常量传入，不纳入依赖
  }, [activeProfile?.id, t]);

  const groups = useMemo(() => groupFields(fields), [fields]);

  const persist = async (next: Record<string, string | number | boolean>) => {
    if (!activeProfile) return;
    try {
      const top: Record<string, unknown> = {};
      const rest: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(next)) {
        if ((TOP_KEYS as readonly string[]).includes(key)) {
          top[key] = value;
        } else {
          rest[key] = value;
        }
      }
      await upsertToolSettings({
        profileId: activeProfile.id,
        toolType,
        settingsJson: JSON.stringify(rest),
        ...top,
      } as Parameters<typeof upsertToolSettings>[0]);
      toast.success(t("settings.saved"));
    } catch {
      toast.error(t("settings.saveFailed"));
    }
  };

  const update = (key: string, value: string | number | boolean) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    void persist(next);
  };

  if (!activeProfile) {
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <Sparkles size={20} className="text-muted-foreground/50" />
        <p className="text-[13px] font-medium text-foreground/80">
          {t("settings.noProfile", { tool: toolLabel })}
        </p>
        <p className="text-xs text-muted-foreground/70">{t("settings.noProfileHint")}</p>
      </div>
    );
  }

  const renderControl = (field: FieldDef) => {
    const value = settings[field.key];
    switch (field.type) {
      case "switch":
        return (
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(checked) => update(field.key, checked)}
          />
        );
      case "select":
        return (
          <Select value={String(value ?? "")} onValueChange={(v) => update(field.key, v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(field.options ?? []).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "number":
        return (
          <Input
            className="w-32"
            type="number"
            min={field.min}
            max={field.max}
            step={field.step}
            value={Number(value)}
            onChange={(e) => update(field.key, Number(e.target.value) || 0)}
          />
        );
      case "textarea":
        return (
          <Textarea
            className="min-h-24 w-full font-mono text-xs md:w-96"
            placeholder={field.placeholderKey ? t(field.placeholderKey) : undefined}
            value={String(value ?? "")}
            onChange={(e) => update(field.key, e.target.value)}
          />
        );
      case "password":
        return (
          <Input
            className="w-56"
            type="password"
            value={String(value ?? "")}
            onChange={(e) => update(field.key, e.target.value)}
          />
        );
      default:
        return (
          <Input
            className="w-56"
            value={String(value ?? "")}
            onChange={(e) => update(field.key, e.target.value)}
          />
        );
    }
  };

  return (
    <div>
      {[...groups.entries()].map(([groupKey, groupFieldsList]) => (
        <div key={groupKey}>
          <SectionHeader title={t(groupKey)} />
          <SettingsCard>
            {groupFieldsList.map((field) => (
              <SettingRow
                key={field.key}
                id={`settings.${field.key}`}
                label={t(field.labelKey)}
                description={field.descKey ? t(field.descKey) : undefined}
              >
                {renderControl(field)}
              </SettingRow>
            ))}
          </SettingsCard>
        </div>
      ))}
      {extra}
    </div>
  );
}

export type { FieldDef };
