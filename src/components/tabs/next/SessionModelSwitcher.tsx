/**
 * 会话内模型配置轻量切换器（M3，design-session-model-config I2）。
 *
 * 挂在状态栏活动会话徽标旁：Popover 内供应商/模型两连选，改动即写回 session
 * 字段并按通道反馈——聊天通道仅换模型时经 /model 热切换（由本组件编排发送，
 * store 只判定策略）；PTY 通道提示重启后生效；双开明确提示不生效原因。
 * 智能体（tool_type）创建后不可切换——cli_args 编码依赖它（update_session
 * 不变量）；claude 精细分档（5 档各异）走编辑弹窗，此处为全档同模型的快速切换。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { useAgentStore } from "@/stores/agentStore";
import {
  compatibleProviders,
  buildDefaultClaudeModels,
  providerDefaultModel,
} from "@/utils/sessionModel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Session } from "@/types";
import type { ClaudeModels } from "@/utils/claudeModels";

export default function SessionModelSwitcher({ session }: { session: Session }) {
  const { t } = useTranslation();
  const llmProviders = useAppStore((s) => s.llmProviders);
  const switchSessionModel = useAppStore((s) => s.switchSessionModel);
  const agentSend = useAgentStore((s) => s.send);

  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState<string | undefined>(session.llmProviderId ?? undefined);

  // 打开时以会话当前字段为准（会话可能被编辑弹窗等外部入口变更过）
  useEffect(() => {
    if (open) {
      setProviderId(session.llmProviderId ?? undefined);
    }
  }, [open, session.llmProviderId]);

  const provider = llmProviders.find((p) => p.id === providerId);
  const currentModel =
    session.toolType === "claude" ? session.claudeModels?.sonnet : session.modelName;

  const apply = async (patch: {
    llmProviderId?: string;
    modelName?: string;
    claudeModels?: ClaudeModels;
  }) => {
    try {
      const result = await switchSessionModel(session.id, patch);
      if (result === "shared") {
        toast.warning(t("sessions.sharedSessionNoSwitch"));
        return;
      }
      if (result === "hot-switch") {
        const model = patch.modelName ?? patch.claudeModels?.sonnet;
        if (model) {
          await agentSend(session.id, `/model ${model}`);
          toast.success(t("sessions.modelSwitched"));
        }
        return;
      }
      if (result === "restart-required") {
        toast.info(t("sessions.appliedAfterRestart"));
      }
    } catch (err) {
      toast.error(`${t("sessions.switchFailed")}: ${String(err)}`);
    }
  };

  const pickProvider = (id: string) => {
    setProviderId(id);
    const next = llmProviders.find((p) => p.id === id);
    if (session.toolType === "claude") {
      void apply({
        llmProviderId: id,
        modelName: undefined,
        claudeModels: next ? buildDefaultClaudeModels(next) : undefined,
      });
    } else {
      void apply({
        llmProviderId: id,
        modelName: next ? providerDefaultModel(next) : undefined,
      });
    }
  };

  const pickModel = (model: string) => {
    if (session.toolType === "claude") {
      const tiers: ClaudeModels = { sonnet: model, opus: model, haiku: model, fable: model, subagent: model };
      void apply({ claudeModels: tiers });
    } else {
      void apply({ modelName: model });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("sessions.switchConfig")}
          title={t("sessions.switchConfig")}
          className="flex h-5 items-center rounded px-0.5 text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronDown size={11} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-3">
        <div className="flex flex-col gap-2.5">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.llmProvider")}</label>
            <Select value={providerId ?? ""} onValueChange={pickProvider}>
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue placeholder={t("sessions.llmProviderPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {compatibleProviders(llmProviders, session.toolType).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {providerId && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.model")}</label>
              <Select value={currentModel ?? ""} onValueChange={pickModel}>
                <SelectTrigger className="h-7 w-full text-xs">
                  <SelectValue placeholder={t("sessions.modelPlaceholder")} />
                </SelectTrigger>
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
      </PopoverContent>
    </Popover>
  );
}
