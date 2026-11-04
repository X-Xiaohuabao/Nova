/**
 * 数据管理页（新骨架，G7）。
 *
 * 数据目录/容量展示 + 导入导出/清除操作。导入导出与目录浏览在旧版即为
 * 占位（功能点清单 G7 拍板：迁移保持占位）；清除类操作经 AlertDialog 确认。
 */

import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";
import SettingsCard from "./SettingsCard";

export default function DataManagementNext() {
  const { t } = useTranslation();

  return (
    <div>
      <SectionHeader title={t("settings.data.storage")} />
      <SettingsCard>
      <SettingRow id="settings.dataDirectory" label={t("settings.data.directory")} description={t("settings.data.directoryDesc")}>
        <div className="flex items-center gap-2">
          <Input className="w-56" value="~/.nova" readOnly />
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info(t("settings.data.browsePlaceholder"))}
          >
            {t("settings.data.browse")}
          </Button>
        </div>
      </SettingRow>
      <SettingRow id="settings.dbSize" label={t("settings.data.dbSize")} description={t("settings.data.dbSizeDesc")}>
        <span className="text-[13px] text-foreground/85">—</span>
      </SettingRow>

            </SettingsCard>

<SectionHeader title={t("settings.data.operations")} />
      <SettingsCard>
      <SettingRow id="settings.exportData" label={t("settings.data.export")} description={t("settings.data.exportDesc")}>
        <Button variant="outline" size="sm" onClick={() => toast.info(t("settings.data.exportPlaceholder"))}>
          {t("settings.data.export")}
        </Button>
      </SettingRow>
      <SettingRow id="settings.importData" label={t("settings.data.import")} description={t("settings.data.importDesc")}>
        <Button variant="outline" size="sm" onClick={() => toast.info(t("settings.data.importPlaceholder"))}>
          {t("settings.data.import")}
        </Button>
      </SettingRow>
      <SettingRow id="settings.clearCache" label={t("settings.data.clearCache")} description={t("settings.data.clearCacheDesc")}>
        <ConfirmDialog
          trigger={<Button variant="outline" size="sm">{t("settings.data.clearCache")}</Button>}
          title={t("settings.data.clearCacheConfirmTitle")}
          description={t("settings.data.clearCacheConfirmDesc")}
          onConfirm={() => toast.success(t("settings.data.cacheCleared"))}
        />
      </SettingRow>
      <SettingRow id="settings.clearAll" label={t("settings.data.clearAll")} description={t("settings.data.clearAllDesc")}>
        <ConfirmDialog
          trigger={<Button variant="destructive" size="sm">{t("settings.data.clearAll")}</Button>}
          title={t("settings.data.clearAllConfirmTitle")}
          description={t("settings.data.clearAllConfirmDesc")}
          confirmLabel={t("settings.data.clearAllConfirmOk")}
          destructive
          onConfirm={() => toast.success(t("settings.data.allCleared"))}
        />
      </SettingRow>
      </SettingsCard>
    </div>
  );
}
