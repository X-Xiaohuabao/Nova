/**
 * 项目默认模型配置弹窗（M4，design-session-model-config I3）。
 *
 * 侧栏项目右键「默认模型配置」打开：三连选（智能体/供应商/模型）编辑 v17 的
 * 项目层默认，保存走 project_update.defaultConfig 全量替换；「清除」发送空
 * 配置（四字段全 NULL）回退全局默认。claude 5 档由所选模型全档同映射自动
 * 生成（精细分档属会话层）；新建会话默认值经 resolve_session_defaults 消费。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAppStore } from "@/stores/appStore";
import { CLI_TOOLS } from "@/components/cli/cliTools";
import {
  compatibleProviders,
  pickDefaultProvider,
  providerDefaultModel,
  MODEL_SWITCHABLE_TOOLS,
} from "@/utils/sessionModel";
import { serializeClaudeModels } from "@/utils/claudeModels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ResponsiveDialog from "@/components/common/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types";

const UNSET = "__unset__";

interface ProjectDefaultsDialogProps {
  project: Project | null;
  open: boolean;
  onClose: () => void;
}

export default function ProjectDefaultsDialog({ project, open, onClose }: ProjectDefaultsDialogProps) {
  const { t } = useTranslation();
  const llmProviders = useAppStore((s) => s.llmProviders);
  const updateProject = useAppStore((s) => s.updateProject);

  const [toolType, setToolType] = useState<string | undefined>();
  const [providerId, setProviderId] = useState<string | undefined>();
  const [modelName, setModelName] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // 打开时以项目当前默认为准
  useEffect(() => {
    if (open && project) {
      setToolType(project.defaultToolType);
      setProviderId(project.defaultLlmProviderId);
      setModelName(project.defaultModelName);
    }
  }, [open, project]);

  const provider = llmProviders.find((p) => p.id === providerId);
  const agentOptions = CLI_TOOLS.filter((m) => MODEL_SWITCHABLE_TOOLS.includes(m.id));

  const pickTool = (value: string) => {
    if (value === UNSET) {
      setToolType(undefined);
      setProviderId(undefined);
      setModelName(undefined);
      return;
    }
    setToolType(value);
    const def = pickDefaultProvider(llmProviders, value);
    setProviderId(def?.id);
    setModelName(def ? providerDefaultModel(def) : undefined);
  };

  const pickProvider = (id: string) => {
    setProviderId(id);
    const next = llmProviders.find((p) => p.id === id);
    setModelName(next ? providerDefaultModel(next) : undefined);
  };

  const save = async () => {
    if (!project) return;
    setSaving(true);
    try {
      const claudeModels =
        toolType === "claude" && modelName
          ? serializeClaudeModels({
              sonnet: modelName,
              opus: modelName,
              haiku: modelName,
              fable: modelName,
              subagent: modelName,
            })
          : undefined;
      await updateProject(project.id, {
        defaultConfig: {
          toolType,
          llmProviderId: toolType ? providerId : undefined,
          modelName: toolType ? modelName : undefined,
          claudeModels: claudeModels,
        },
      });
      toast.success(t("sessions.defaultsSaved"));
      onClose();
    } catch (err) {
      toast.error(`${t("sessions.switchFailed")}: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!project) return;
    setSaving(true);
    try {
      // 空配置 = 四字段全 NULL，解析链回退到全局默认
      await updateProject(project.id, { defaultConfig: {} });
      toast.success(t("sessions.defaultsCleared"));
      onClose();
    } catch (err) {
      toast.error(`${t("sessions.switchFailed")}: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`${t("sessions.projectDefaults")}${project ? ` — ${project.name}` : ""}`}
      size="sm"
      footer={
        <div className="flex w-full items-center justify-between">
          <Button variant="ghost" onClick={() => void clear()} disabled={saving}>
            {t("sessions.clearDefaults")}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button onClick={() => void save()} disabled={saving}>{t("common.save")}</Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.switcherAgent")}</label>
          <Select value={toolType ?? UNSET} onValueChange={pickTool}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={UNSET}>{t("sessions.defaultsNotSet")}</SelectItem>
              {agentOptions.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {toolType && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.llmProvider")}</label>
            <Select value={providerId ?? ""} onValueChange={pickProvider}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("sessions.llmProviderPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {compatibleProviders(llmProviders, toolType).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {toolType && providerId && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.model")}</label>
            <Select value={modelName ?? ""} onValueChange={setModelName}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("sessions.modelPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {(provider?.models ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.modelName}>
                    {m.modelName}
                    {m.isDefault && (
                      <span className="ml-2 text-[10px] text-muted-foreground/50">{t("sessions.defaultModelTag")}</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
