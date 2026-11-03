/**
 * 新建会话分类弹窗（新骨架，C2 / T12）。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAppStore } from "@/stores/appStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ResponsiveDialog from "@/components/common/ResponsiveDialog";
import { ColorPickerRow } from "./NewProjectModalNext";

const CATEGORY_COLORS = ["#722ed1", "#1890ff", "#1677ff", "#fa8c16", "#52c41a", "#13c2c2", "#eb2f96", "#ff4d4f"];

interface NewCategoryModalNextProps {
  open: boolean;
  projectId: string | null;
  onClose: () => void;
}

export default function NewCategoryModalNext({ open, projectId, onClose }: NewCategoryModalNextProps) {
  const { t } = useTranslation();
  const createCategory = useAppStore((s) => s.createCategory);

  const [name, setName] = useState("");
  const [color, setColor] = useState(CATEGORY_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const resetAndClose = () => {
    setName("");
    setColor(CATEGORY_COLORS[0]);
    onClose();
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.warning(t("sessions.categoryNameRequired"));
      return;
    }
    if (!projectId) {
      toast.warning(t("sessions.projectRequired"));
      return;
    }
    setLoading(true);
    try {
      await createCategory({ projectId, name: name.trim(), color });
      toast.success(t("sessions.categoryCreated"));
      resetAndClose();
    } catch (e) {
      toast.error(`${t("sessions.createFailed")}: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetAndClose();
      }}
      title={t("sessions.newCategory")}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetAndClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void submit()} disabled={loading}>{t("common.create")}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.categoryName")}</label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("sessions.categoryNamePlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>
        <ColorPickerRow label={t("sessions.colorMark")} colors={CATEGORY_COLORS} value={color} onChange={setColor} />
      </div>
    </ResponsiveDialog>
  );
}
