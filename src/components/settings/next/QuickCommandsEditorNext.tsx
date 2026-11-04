/**
 * 快捷命令编辑器（新骨架，token 版）。
 *
 * 每工具一段文本（quickCommandsByToolType），F2 气泡面板（QuickCommands，T13）
 * 消费同一份数据；--- 行表示分隔线。
 */

import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import { Textarea } from "@/components/ui/textarea";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";
import SettingsCard from "./SettingsCard";

interface QuickCommandsEditorNextProps {
  toolType: string;
}

export default function QuickCommandsEditorNext({ toolType }: QuickCommandsEditorNextProps) {
  const { t } = useTranslation();
  const value = useAppStore((s) => s.quickCommandsByToolType[toolType] ?? "");
  const update = useAppStore((s) => s.updateQuickCommands);

  return (
    <div>
      <SectionHeader title={t("settings.quickCommands")} />
      <SettingsCard>
        <SettingRow id="settings.quickCommands" label={t("settings.quickCommands")} description={t("settings.quickCommandsDesc")}>
          <Textarea
            className="min-h-24 w-full font-mono text-xs md:w-96"
            placeholder={t("settings.quickCommandsPlaceholder")}
            value={value}
            onChange={(e) => update(toolType, e.target.value)}
          />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
