/**
 * 编辑会话弹窗（新骨架，B1 / T12）。
 *
 * 回填/提交逻辑与旧 EditSessionModal 对齐：cliArgs 反解析（claude 参数 /
 * SSH JSON）、颜色继承（分类→会话→项目）、切换供应商时 Claude 分层模型
 * 自动带默认（首次加载保留会话存量映射）、SSH 参数变更且连接存活时提示
 * 重连生效。profileId 原样透传（编辑弹窗不提供切换，与旧行为一致）。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAppStore } from "@/stores/appStore";
import { testSshConnection } from "@/utils/ipc";
import { parseClaudeModels, CLAUDE_TIER_ENTRIES } from "@/utils/claudeModels";
import { BUILTIN_SESSION_TEMPLATES, TOOL_PROVIDER_KIND_MAP } from "@/types";
import type { ToolType, CliTool, LlmProvider, SshArgs } from "@/types";
import { EMPTY_SSH_ARGS, parseSshArgsJson, serializeSshArgs } from "@/utils/sshArgs";
import { CLI_TOOLS, sortCliToolsByAvailability, isCliToolAvailable } from "@/components/cli/cliTools";
import CliArgsClaudeNext from "@/components/cli/CliArgsClaudeNext";
import SshArgsFieldsNext from "@/components/cli/SshArgsFieldsNext";
import { toolVisual } from "@/components/tabs/tabVisuals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ResponsiveDialog from "@/components/common/ResponsiveDialog";
import { ColorPickerRow } from "./NewProjectModalNext";

const COLOR_PRESETS = ["#722ed1", "#1890ff", "#1677ff", "#fa8c16", "#52c41a", "#13c2c2", "#eb2f96", "#ff4d4f"];

const THINKING_LEVELS = [
  { value: "low", labelKey: "sessions.thinkingLow", color: "var(--color-success)" },
  { value: "medium", labelKey: "sessions.thinkingMedium", color: "var(--color-primary)" },
  { value: "high", labelKey: "sessions.thinkingHigh", color: "#722ed1" },
];

interface EditSessionModalNextProps {
  open: boolean;
  sessionId: string | null;
  onClose: () => void;
}

function buildCliArgs(toolType: ToolType, params: Record<string, unknown>): string {
  const args: string[] = [];

  if (toolType === "claude") {
    if (params.dangerouslySkipPermissions) args.push("--dangerously-skip-permissions");
    if (params.verbose) args.push("--verbose");
    if (params.maxTurns) args.push("--max-turns", String(params.maxTurns));
    if (params.appendSystemPrompt) args.push("--append-system-prompt", String(params.appendSystemPrompt));
    if (params.mcpConfig) args.push("--mcp-config", String(params.mcpConfig));
    const allowed = params.allowedTools as string[] | undefined;
    if (allowed?.length) args.push("--allowedTools", allowed.join(","));
    const disallowed = params.disallowedTools as string[] | undefined;
    if (disallowed?.length) args.push("--disallowedTools", disallowed.join(","));
  }

  return args.length > 0 ? JSON.stringify(args) : "";
}

function buildDefaultClaudeModels(provider: LlmProvider) {
  const defModel =
    provider.models.find((m) => m.isDefault)?.modelName ?? provider.models[0]?.modelName;
  if (!defModel) return {};
  return { sonnet: defModel, opus: defModel, haiku: defModel, fable: defModel, subagent: defModel };
}

type ClaudeModelsState = ReturnType<typeof parseClaudeModels>;

export default function EditSessionModalNext({ open: isOpen, sessionId, onClose }: EditSessionModalNextProps) {
  const { t } = useTranslation();
  const updateSession = useAppStore((s) => s.updateSession);
  const sessions = useAppStore((s) => s.sessions);
  const projects = useAppStore((s) => s.projects);
  const categories = useAppStore((s) => s.categories);
  const cliTools = useAppStore((s) => s.cliTools);
  const llmProviders = useAppStore((s) => s.llmProviders);
  const loadLlmProviders = useAppStore((s) => s.loadLlmProviders);

  const session = sessionId ? sessions.find((x) => x.id === sessionId) : undefined;
  const project = session ? projects.find((p) => p.id === session.projectId) : undefined;

  const [selectedTool, setSelectedTool] = useState<ToolType | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>(COLOR_PRESETS[0]);
  const [title, setTitle] = useState("");
  const [thinkingIntensity, setThinkingIntensity] = useState("medium");
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [envVars, setEnvVars] = useState("");
  const [cliParams, setCliParams] = useState<Record<string, unknown>>({});
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [llmProviderId, setLlmProviderId] = useState<string | undefined>();
  const [modelName, setModelName] = useState<string | undefined>();
  const [claudeModels, setClaudeModels] = useState<ClaudeModelsState>({});
  const [sshArgs, setSshArgs] = useState<SshArgs>(EMPTY_SSH_ARGS);
  const [testingConnection, setTestingConnection] = useState(false);
  const claudeProviderSyncedRef = useRef(false);

  const filteredCategories = session
    ? categories.filter((c) => c.projectId === session.projectId)
    : [];

  const compatibleProviders = (toolType: ToolType | null): LlmProvider[] => {
    if (!toolType) return [];
    const allowedKinds = TOOL_PROVIDER_KIND_MAP[toolType] ?? [];
    return llmProviders.filter((p) => p.isActive && allowedKinds.includes(p.providerKind));
  };

  const sshParamsDiffer = (nextJson: string): boolean => {
    const readParams = (json: string | undefined) => {
      if (!json) return null;
      try {
        const parsed = JSON.parse(json) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        // 读不出旧值时保守判定为"变了"：宁可多提示一次，也不要让用户以为密码已生效
        return null;
      }
    };
    const oldParams = readParams(session?.cliArgs);
    const nextParams = readParams(nextJson);
    return JSON.stringify(oldParams ?? {}) !== JSON.stringify(nextParams ?? {});
  };

  // 打开时回填
  useEffect(() => {
    if (!isOpen || !session) return;
    claudeProviderSyncedRef.current = false;
    setSelectedTool(session.toolType);
    // 分类下颜色完全继承分类；未分类保留会话颜色，否则回落项目颜色
    if (session.categoryId) {
      const cat = categories.find((c) => c.id === session.categoryId);
      setSelectedColor(cat?.color || session.color || project?.color || COLOR_PRESETS[0]);
    } else {
      setSelectedColor(session.color || project?.color || COLOR_PRESETS[0]);
    }
    setTitle(session.title || "");
    setThinkingIntensity(session.thinkingIntensity || "medium");
    setTemplateId(session.templateId);
    setEnvVars(session.envVars || "");
    setCategoryId(session.categoryId);
    setLlmProviderId(session.llmProviderId);
    setModelName(session.modelName);
    setClaudeModels(parseClaudeModels(session.claudeModels));
    setSshArgs(EMPTY_SSH_ARGS);

    if (session.cliArgs) {
      try {
        const parsed = JSON.parse(session.cliArgs) as unknown;
        const ssh = parseSshArgsJson(session.cliArgs);
        if (session.toolType === "ssh" && ssh) {
          setSshArgs(ssh);
          setCliParams({});
        } else if (Array.isArray(parsed)) {
          const params: Record<string, unknown> = {};
          for (let i = 0; i < parsed.length; i++) {
            const arg = parsed[i];
            if (arg === "--dangerously-skip-permissions") params.dangerouslySkipPermissions = true;
            else if (arg === "--verbose") params.verbose = true;
            else if (arg === "--max-turns") params.maxTurns = parsed[++i];
            else if (arg === "--append-system-prompt") params.appendSystemPrompt = parsed[++i];
            else if (arg === "--mcp-config") params.mcpConfig = parsed[++i];
            else if (arg === "--allowedTools") params.allowedTools = (parsed[++i] || "").split(",");
            else if (arg === "--disallowedTools") params.disallowedTools = (parsed[++i] || "").split(",");
          }
          setCliParams(params);
        } else {
          setCliParams({});
        }
      } catch {
        setCliParams({});
      }
    } else {
      setCliParams({});
    }
  }, [isOpen, session, categories, project?.color]);

  useEffect(() => {
    if (isOpen && llmProviders.length === 0) {
      loadLlmProviders().catch(() => {});
    }
  }, [isOpen, llmProviders.length, loadLlmProviders]);

  // 切换 LLM 供应商时自动带出 Claude 各 tier 默认模型（首次加载保留会话存量）
  useEffect(() => {
    if (!isOpen) {
      claudeProviderSyncedRef.current = false;
      return;
    }
    if (selectedTool !== "claude" || !llmProviderId) return;
    if (!claudeProviderSyncedRef.current) {
      claudeProviderSyncedRef.current = true;
      return;
    }
    const provider = llmProviders.find((p) => p.id === llmProviderId);
    if (!provider) return;
    setClaudeModels(buildDefaultClaudeModels(provider));
  }, [llmProviderId, llmProviders, selectedTool, isOpen]);

  const sortedTools = sortCliToolsByAvailability(CLI_TOOLS, cliTools);
  const getToolInfo = (toolType: ToolType): CliTool | undefined =>
    cliTools.find((tool) => tool.toolType === toolType);

  const handleTestSsh = async () => {
    if (!sshArgs.hostname.trim()) {
      toast.warning(t("sessions.sshHostnameRequired"));
      return;
    }
    setTestingConnection(true);
    try {
      const result = await testSshConnection({
        hostname: sshArgs.hostname,
        port: sshArgs.port,
        username: sshArgs.username,
        password: sshArgs.password || undefined,
        identity_file: sshArgs.identityFile || undefined,
      });
      toast.success(result);
    } catch (err) {
      toast.error(`${t("sessions.sshTestFailed")}: ${String(err)}`);
    } finally {
      setTestingConnection(false);
    }
  };

  const submit = async () => {
    if (!selectedTool) {
      toast.warning(t("sessions.toolRequired"));
      return;
    }
    if (!sessionId) {
      toast.warning(t("sessions.sessionMissing"));
      return;
    }
    if (selectedTool === "ssh" && !sshArgs.hostname.trim()) {
      toast.warning(t("sessions.sshHostnameRequired"));
      return;
    }

    const finalCliArgs =
      selectedTool === "ssh"
        ? serializeSshArgs(sshArgs)
        : buildCliArgs(selectedTool, cliParams) || undefined;

    // 只有"参数变了 + 连接还活着"才提示：已关闭的 tab 下次打开自然用新参数
    const needsReconnect =
      selectedTool === "ssh" &&
      Boolean(session?.isRunning) &&
      finalCliArgs !== undefined &&
      sshParamsDiffer(finalCliArgs);

    try {
      await updateSession(sessionId, {
        title: title.trim() || undefined,
        toolType: selectedTool,
        color: selectedColor,
        thinkingIntensity,
        templateId,
        cliArgs: finalCliArgs,
        envVars: envVars.trim() || undefined,
        categoryId: categoryId || undefined,
        llmProviderId: selectedTool !== "ssh" && selectedTool !== "terminal" ? llmProviderId : undefined,
        modelName: selectedTool !== "ssh" && selectedTool !== "terminal" ? modelName : undefined,
        claudeModels: selectedTool === "claude" ? claudeModels : undefined,
      });
      if (needsReconnect) {
        toast.warning(t("sessions.sshReconnectHint"), { duration: 5000 });
      } else {
        toast.success(t("sessions.saved"));
      }
      onClose();
    } catch (err) {
      toast.error(`${t("sessions.saveFailed")}: ${String(err)}`);
    }
  };

  const provider = llmProviders.find((p) => p.id === llmProviderId);

  return (
    <ResponsiveDialog
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`${t("sessions.editSession")}${project ? ` — ${project.name}` : ""}`}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void submit()}>{t("common.save")}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.category")}</label>
          <Select value={categoryId ?? ""} onValueChange={(v) => setCategoryId(v || undefined)}>
            <SelectTrigger className="w-full"><SelectValue placeholder={t("sessions.categoryPlaceholder")} /></SelectTrigger>
            <SelectContent>
              {filteredCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.sessionTitle")}</label>
          <Input className="h-7" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {/* CLI 工具（可改） */}
        <div>
          <label className="mb-1.5 block text-xs text-muted-foreground">{t("sessions.cliTool")}</label>
          <div className="flex flex-wrap gap-2">
            {sortedTools.map((meta) => {
              const toolInfo = getToolInfo(meta.id);
              const available = isCliToolAvailable(meta, cliTools);
              const isSelected = selectedTool === meta.id;
              const visual = toolVisual(meta.id);
              return (
                <button
                  key={meta.id}
                  type="button"
                  title={`${meta.desc}${toolInfo?.version ? ` · v${toolInfo.version}` : ""}${available ? "" : ` · ${t("sessions.notInstalled")}`}`}
                  onClick={() => available && setSelectedTool(meta.id)}
                  className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors"
                  style={{
                    cursor: available ? "pointer" : "default",
                    backgroundColor: isSelected ? meta.color : "transparent",
                    borderColor: isSelected ? meta.color : "var(--color-border)",
                    opacity: available ? 1 : 0.4,
                    color: isSelected ? "#ffffff" : "var(--color-foreground)",
                  }}
                >
                  <visual.Icon size={14} />
                  <span>{meta.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedTool !== "ssh" && selectedTool !== "terminal" && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.llmProvider")}</label>
            <Select
              value={llmProviderId ?? ""}
              onValueChange={(id) => {
                setLlmProviderId(id || undefined);
                const next = llmProviders.find((p) => p.id === id);
                if (selectedTool === "claude" && next) {
                  setClaudeModels(buildDefaultClaudeModels(next));
                  setModelName(undefined);
                } else if (next) {
                  setModelName(next.models.find((m) => m.isDefault)?.modelName);
                  setClaudeModels({});
                } else {
                  setModelName(undefined);
                  setClaudeModels({});
                }
              }}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder={t("sessions.llmProviderPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {compatibleProviders(selectedTool).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}（{p.providerKind}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedTool !== "ssh" && selectedTool !== "terminal" && llmProviderId && (
          <div>
            {selectedTool === "claude" ? (
              <>
                <label className="mb-1.5 block text-xs text-muted-foreground">{t("sessions.claudeModelMapping")}</label>
                {CLAUDE_TIER_ENTRIES.map(({ modelKey, oneMKey, label }) => {
                  const tierModel = claudeModels[modelKey];
                  const oneM = claudeModels[oneMKey] ?? false;
                  return (
                    <div key={modelKey} className="mb-2">
                      <div className="mb-0.5 flex items-baseline justify-between">
                        <span className="text-[11px] text-muted-foreground">{label}</span>
                        <span className="text-[11px] text-muted-foreground/60">{t("sessions.oneM")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={tierModel ?? ""}
                          onValueChange={(v) => setClaudeModels({ ...claudeModels, [modelKey]: v || undefined })}
                        >
                          <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue placeholder={t("sessions.modelPlaceholder")} /></SelectTrigger>
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
                        <Checkbox
                          checked={oneM}
                          onCheckedChange={(checked) =>
                            setClaudeModels({ ...claudeModels, [oneMKey]: checked === true })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <>
                <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.model")}</label>
                <Select value={modelName ?? ""} onValueChange={(v) => setModelName(v || undefined)}>
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
              </>
            )}
          </div>
        )}

        <ColorPickerRow label={t("sessions.colorMark")} colors={COLOR_PRESETS} value={selectedColor} onChange={setSelectedColor} />

        {selectedTool !== "ssh" && (
          <div>
            <label className="mb-1.5 block text-xs text-muted-foreground">{t("sessions.thinkingIntensity")}</label>
            <div className="flex gap-2">
              {THINKING_LEVELS.map((level) => {
                const isSelected = thinkingIntensity === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setThinkingIntensity(level.value)}
                    className="flex items-center gap-1.5 rounded-md border px-3.5 py-1.5 text-xs transition-colors"
                    style={{
                      borderColor: isSelected ? level.color : "var(--color-border)",
                      background: isSelected ? "var(--color-accent)" : "transparent",
                      color: isSelected ? level.color : "var(--color-muted-foreground)",
                      fontWeight: isSelected ? 600 : 400,
                    }}
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: isSelected ? level.color : "var(--color-muted-foreground)" }}
                    />
                    {t(level.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selectedTool !== "ssh" && (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.template")}</label>
            <Select value={templateId ?? ""} onValueChange={(v) => setTemplateId(v || undefined)}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("sessions.templatePlaceholder")} /></SelectTrigger>
              <SelectContent>
                {BUILTIN_SESSION_TEMPLATES.map((tmpl) => (
                  <SelectItem key={tmpl.id} value={tmpl.id}>{tmpl.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selectedTool === "claude" && (
          <div className="border-t border-border/60 pt-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">{t("sessions.claudeArgs")}</label>
            <CliArgsClaudeNext value={cliParams} onChange={setCliParams} />
          </div>
        )}

        {selectedTool === "ssh" && (
          <div className="border-t border-border/60 pt-2">
            <label className="mb-1.5 block text-xs text-muted-foreground">{t("sessions.sshArgs")}</label>
            <SshArgsFieldsNext
              value={sshArgs}
              onChange={setSshArgs}
              onTest={() => void handleTestSsh()}
              testing={testingConnection}
            />
          </div>
        )}

        <div className="border-t border-border/60 pt-2">
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("sessions.envVarsLabel")}
            <span className="ml-1 text-[10px] text-muted-foreground/50">{t("sessions.envVarsLineHint")}</span>
          </label>
          <Textarea
            className="min-h-12 font-mono text-xs"
            rows={2}
            value={envVars}
            onChange={(e) => setEnvVars(e.target.value)}
          />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
