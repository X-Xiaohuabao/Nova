/**
 * 新建项目弹窗（新骨架，C1 / T12）。
 *
 * 名称 / 路径（Tauri 目录选择）/ 颜色标记；创建后确保项目展开。
 * 弹层经 ResponsiveDialog；文案走 i18n。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ResponsiveDialog from "@/components/common/ResponsiveDialog";

export const PROJECT_COLORS = ["#3b82f6", "#722ed1", "#1890ff", "#52c41a", "#fa8c16", "#eb2f96", "#f5222d", "#888888"];

interface NewProjectModalNextProps {
  open: boolean;
  onClose: () => void;
}

export default function NewProjectModalNext({ open, onClose }: NewProjectModalNextProps) {
  const { t } = useTranslation();
  const createProject = useAppStore((s) => s.createProject);
  const toggleProjectCollapsed = useAppStore((s) => s.toggleProjectCollapsed);
  const collapsedProjectIds = useAppStore((s) => s.collapsedProjectIds);

  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [color, setColor] = useState(PROJECT_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const handleBrowse = async () => {
    const selected = await openDialog({ directory: true, multiple: false });
    if (selected && typeof selected === "string") {
      setPath(selected);
      if (!name.trim()) {
        setName(selected.split(/[/\\]/).pop() || selected);
      }
    }
  };

  const resetAndClose = () => {
    setName("");
    setPath("");
    setColor(PROJECT_COLORS[0]);
    onClose();
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.warning(t("sessions.nameRequired"));
      return;
    }
    if (!path.trim()) {
      toast.warning(t("sessions.pathRequired"));
      return;
    }
    setLoading(true);
    try {
      const project = await createProject(name.trim(), path.trim(), color);
      // 确保新项目展开
      if (collapsedProjectIds.includes(project.id)) {
        toggleProjectCollapsed(project.id);
      }
      toast.success(t("sessions.projectCreated"));
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
      title={t("sessions.newProject")}
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
          <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.projectName")}</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-project"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.projectPath")}</label>
          <div className="flex gap-2">
            <Input
              className="flex-1"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="~/projects/my-project"
            />
            <Button variant="outline" onClick={() => void handleBrowse()}>{t("sessions.browse")}</Button>
          </div>
        </div>
        <ColorPickerRow
          label={t("sessions.colorMark")}
          colors={PROJECT_COLORS}
          value={color}
          onChange={setColor}
        />
      </div>
    </ResponsiveDialog>
  );
}

/** 颜色圆点选择行（项目/分类/会话弹窗共用视觉） */
export function ColorPickerRow({
  label,
  colors,
  value,
  onChange,
}: {
  label: string;
  colors: string[];
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="flex gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => onChange(c)}
            className="h-5 w-5 rounded-full border-2 transition-transform"
            style={{
              backgroundColor: c,
              borderColor: value === c ? "var(--color-border)" : "transparent",
              transform: value === c ? "scale(1.2)" : "scale(1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
