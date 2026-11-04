/**
 * 新建会话弹窗（新骨架，B1/B2 / T12；M2 交互重构）。
 *
 * 默认态：摘要行显示后端 resolve_session_defaults 三层解析结果（项目 → 全局
 * → 兜底，含来源徽标），一键创建（≤2 次交互）；工具/供应商/模型为可见的快速
 * 切换路径。高级配置折叠区收纳：分类/名称/颜色/思考强度/模板/Claude 参数/
 * Claude 5 档映射（含 1M 标记）/环境变量；SSH 参数保持可见（必填核心）。
 * 颜色继承（分类→项目）；弹层经 ResponsiveDialog；受控 state 表单（动态条件
 * 字段多，不套 RHF）。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { detectCliTools, testSshConnection, resolveSessionDefaults } from "@/utils/ipc";
import { CLAUDE_TIER_ENTRIES, parseClaudeModels } from "@/utils/claudeModels";
import { BUILTIN_SESSION_TEMPLATES } from "@/types";
import type { ToolType, CliTool, SshArgs, SessionDefaults } from "@/types";
import {
  compatibleProviders,
  pickDefaultProvider,
  buildDefaultClaudeModels,
  providerDefaultModel,
} from "@/utils/sessionModel";
import { EMPTY_SSH_ARGS, serializeSshArgs } from "@/utils/sshArgs";
import { CLI_TOOLS, sortCliToolsByAvailability, isCliToolAvailable, type CliToolMeta } from "@/components/cli/cliTools";
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

interface NewSessionModalNextProps {
  open: boolean;
  projectId: string | null;
  categoryId?: string | null;
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

type ClaudeModelsState = {
  sonnet?: string;
  opus?: string;
  haiku?: string;
  fable?: string;
  subagent?: string;
  sonnet1M?: boolean;
  opus1M?: boolean;
  haiku1M?: boolean;
  fable1M?: boolean;
  subagent1M?: boolean;
};

export default function NewSessionModalNext({ open: isOpen, projectId, categoryId, onClose }: NewSessionModalNextProps) {
  const { t } = useTranslation();
  const createSession = useAppStore((s) => s.createSession);
  const cliTools = useAppStore((s) => s.cliTools);
  const setCliTools = useAppStore((s) => s.setCliTools);
  const globalThinkingIntensity = useAppStore((s) => s.globalThinkingIntensity);
  const projects = useAppStore((s) => s.projects);
  const categories = useAppStore((s) => s.categories);
  const llmProviders = useAppStore((s) => s.llmProviders);
  const loadLlmProviders = useAppStore((s) => s.loadLlmProviders);

  const [selectedTool, setSelectedTool] = useState<ToolType | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>(COLOR_PRESETS[0]);
  const [title, setTitle] = useState("");
  const [thinkingIntensity, setThinkingIntensity] = useState(globalThinkingIntensity);
  const [templateId, setTemplateId] = useState<string | undefined>();
  const [envVars, setEnvVars] = useState("");
  const [cliParams, setCliParams] = useState<Record<string, unknown>>({});
  const [sessionCategoryId, setSessionCategoryId] = useState<string | undefined>(undefined);
  const [llmProviderId, setLlmProviderId] = useState<string | undefined>();
  const [modelName, setModelName] = useState<string | undefined>();
  const [claudeModels, setClaudeModels] = useState<ClaudeModelsState>({});
  const [sshArgs, setSshArgs] = useState<SshArgs>(EMPTY_SSH_ARGS);
  const [testingConnection, setTestingConnection] = useState(false);
  // 用户已手动选工具则为 true：后端默认值解析返回时不覆盖用户选择
  const userPickedToolRef = useRef(false);
  // 后端三层解析结果（摘要行显示"将使用 …（项目默认/全局默认）"）与折叠态
  const [resolvedDefaults, setResolvedDefaults] = useState<SessionDefaults | null>(null);
  const [resolving, setResolving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const project = projects.find((p) => p.id === projectId);
  const filteredCategories = projectId ? categories.filter((c) => c.projectId === projectId) : [];

  useEffect(() => {
    if (isOpen && cliTools.length === 0) {
      detectCliTools().then(setCliTools).catch(() => {});
    }
  }, [isOpen, cliTools.length, setCliTools]);

  useEffect(() => {
    if (isOpen && llmProviders.length === 0) {
      loadLlmProviders().catch(() => {});
    }
  }, [isOpen, llmProviders.length, loadLlmProviders]);

  // 打开时重置（颜色继承项目）
  useEffect(() => {
    if (!isOpen) return;
    userPickedToolRef.current = false;
    setSelectedTool(null);
    setSelectedColor(project?.color || COLOR_PRESETS[0]);
    setTitle("");
    setThinkingIntensity(globalThinkingIntensity);
    setTemplateId(undefined);
    setEnvVars("");
    setCliParams({});
    setSshArgs(EMPTY_SSH_ARGS);
    setSessionCategoryId(categoryId || undefined);
    setLlmProviderId(undefined);
    setModelName(undefined);
    setClaudeModels({});
    setResolvedDefaults(null);
    setResolving(false);
    setAdvancedOpen(false);
  }, [isOpen, globalThinkingIntensity, categoryId, project?.color]);

  // 颜色继承：分类 → 项目
  useEffect(() => {
    if (!isOpen) return;
    if (sessionCategoryId) {
      const cat = categories.find((c) => c.id === sessionCategoryId);
      if (cat?.color) setSelectedColor(cat.color);
    } else if (project?.color) {
      setSelectedColor(project.color);
    }
  }, [isOpen, sessionCategoryId, project?.color, categories]);

  // 默认值：后端三层解析（项目 → 全局 → 兜底，单一真相源）。打开/切项目时解析
  // 一次直接采纳，取代原先"读第一个 Profile 的 tool_settings 偏好 + 前端三级
  // 回退 effect 链"的暗规则；用户已手动选工具则不覆盖。
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setResolving(true);
    resolveSessionDefaults(projectId ?? undefined)
      .then((d) => {
        if (cancelled) return;
        setResolvedDefaults(d);
        if (userPickedToolRef.current || !d.toolType) return;
        const tool = d.toolType as ToolType;
        setSelectedTool(tool);
        setCliParams(tool === "claude" ? { dangerouslySkipPermissions: true } : {});
        setLlmProviderId(d.llmProviderId);
        if (tool === "claude") {
          setClaudeModels(d.claudeModels ? parseClaudeModels(d.claudeModels) : {});
          setModelName(undefined);
        } else {
          setModelName(d.modelName);
          setClaudeModels({});
        }
      })
      .catch(() => {
        // 解析失败不阻塞新建流程，各下拉留空由用户手动选择
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId]);

  // 非 claude 工具清空分层映射
  useEffect(() => {
    if (selectedTool !== "claude") {
      setClaudeModels({});
    }
  }, [selectedTool]);

  const sortedTools = sortCliToolsByAvailability(CLI_TOOLS, cliTools);
  const getToolInfo = (toolType: ToolType): CliTool | undefined =>
    cliTools.find((tool) => tool.toolType === toolType);

  // 手动选工具：默认供应商同步推导（全局默认兼容时 → 第一个兼容供应商），
  // 不再异步读 Profile 的 tool_settings 偏好。
  const pickTool = (meta: CliToolMeta, available: boolean) => {
    if (!available) return;
    userPickedToolRef.current = true;
    setSelectedTool(meta.id);
    setCliParams(meta.id === "claude" ? { dangerouslySkipPermissions: true } : {});
    if (meta.id === "ssh" || meta.id === "terminal") {
      setLlmProviderId(undefined);
      setModelName(undefined);
      setClaudeModels({});
      return;
    }
    const provider = pickDefaultProvider(llmProviders, meta.id);
    setLlmProviderId(provider?.id);
    if (meta.id === "claude") {
      setClaudeModels(provider ? buildDefaultClaudeModels(provider) : {});
      setModelName(undefined);
    } else {
      setModelName(provider ? providerDefaultModel(provider) : undefined);
      setClaudeModels({});
    }
  };

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
    if (!projectId) {
      toast.warning(t("sessions.projectRequired"));
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

    try {
      await createSession({
        projectId,
        toolType: selectedTool,
        title: title.trim() || undefined,
        color: selectedColor,
        thinkingIntensity,
        templateId,
        cliArgs: finalCliArgs,
        envVars: envVars.trim() || undefined,
        categoryId: sessionCategoryId,
        llmProviderId,
        modelName,
        // store 边界处统一序列化为字符串；弹窗始终以对象形态操作
        claudeModels: selectedTool === "claude" ? claudeModels : undefined,
      });
      onClose();
    } catch (err) {
      toast.error(`${t("sessions.createSessionFailed")}: ${String(err)}`);
    }
  };

  const provider = llmProviders.find((p) => p.id === llmProviderId);

  // 摘要行内容：当前 工具 · 供应商 · 模型；选择未偏离解析结果时标注来源
  const toolMeta = CLI_TOOLS.find((m) => m.id === selectedTool);
  const summaryModel =
    selectedTool === "claude" ? (claudeModels.sonnet ?? resolvedDefaults?.modelName) : modelName;
  const untouchedDefault =
    resolvedDefaults !== null &&
    selectedTool === ((resolvedDefaults.toolType as ToolType | undefined) ?? null) &&
    (llmProviderId ?? null) === (resolvedDefaults.llmProviderId ?? null);

  return (
    <ResponsiveDialog
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={`${t("sessions.newSession")}${project ? ` — ${project.name}` : ""}`}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void submit()} disabled={!selectedTool || !projectId}>
            {t("common.create")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        {/* 默认态摘要行：三层解析结果一键创建；改选后实时反映当前选择 */}
        <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs">
          {selectedTool ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="text-muted-foreground">{t("sessions.willUse")}</span>
              <span className="font-medium text-foreground">{toolMeta?.name ?? selectedTool}</span>
              {provider && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-medium text-foreground">{provider.name}</span>
                  {summaryModel && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground">{summaryModel}</span>
                    </>
                  )}
                </>
              )}
              {untouchedDefault && (
                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {resolvedDefaults?.source === "project"
                    ? t("sessions.defaultsSourceProject")
                    : resolvedDefaults?.source === "global"
                      ? t("sessions.defaultsSourceGlobal")
                      : t("sessions.defaultsSourceFallback")}
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">
              {resolving ? t("sessions.resolvingDefaults") : t("sessions.pickToolPrompt")}
            </span>
          )}
        </div>

        {/* CLI 工具选择 */}
        <div>
          <label className="mb-1.5 block text-xs text-muted-foreground">
            {t("sessions.cliTool")} <span className="text-destructive">*</span>
            <span className="ml-1.5 text-[10px] text-muted-foreground/50">{t("sessions.cliToolHint")}</span>
          </label>
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
                  onClick={() => void pickTool(meta, available)}
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

        {/* LLM 供应商（非 ssh/terminal） */}
        {selectedTool && selectedTool !== "ssh" && selectedTool !== "terminal" && (
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
                  setModelName(providerDefaultModel(next));
                  setClaudeModels({});
                } else {
                  setModelName(undefined);
                  setClaudeModels({});
                }
              }}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder={t("sessions.llmProviderPlaceholder")} /></SelectTrigger>
              <SelectContent>
                {compatibleProviders(llmProviders, selectedTool).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}（{p.providerKind}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 模型（非 claude 智能体；claude 的 5 档映射收纳进高级配置） */}
        {selectedTool !== "ssh" && selectedTool !== "terminal" && selectedTool !== "claude" && llmProviderId && (
          <div>
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
          </div>
        )}

        {/* SSH 参数（ssh 的必填核心参数，保持默认态可见） */}
        {selectedTool === "ssh" && (
          <div className="border-t border-border/60 pt-2">
            <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.sshArgs")}</label>
            <SshArgsFieldsNext
              value={sshArgs}
              onChange={setSshArgs}
              onTest={() => void handleTestSsh()}
              testing={testingConnection}
            />
          </div>
        )}

        {/* 高级配置：默认路径收起，一键创建用解析出的默认值 */}
        <div className="border-t border-border/60 pt-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown size={12} className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            {t("sessions.advancedConfig")}
          </button>
          {advancedOpen && (
            <div className="mt-2 flex flex-col gap-3">
              {/* 所属分类 */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.category")}</label>
                <Select value={sessionCategoryId ?? ""} onValueChange={(v) => setSessionCategoryId(v || undefined)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder={t("sessions.categoryPlaceholder")} /></SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 会话名称 */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.sessionTitle")}</label>
                <Input
                  className="h-7"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("sessions.sessionTitlePlaceholder")}
                />
              </div>

              {/* 颜色标记（未选分类时） */}
              {!sessionCategoryId && (
                <ColorPickerRow label={t("sessions.colorMark")} colors={COLOR_PRESETS} value={selectedColor} onChange={setSelectedColor} />
              )}

              {/* 思考强度（非 ssh） */}
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

              {/* 会话模板（非 ssh） */}
              {selectedTool !== "ssh" && (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">{t("sessions.template")}</label>
                  <Select value={templateId ?? ""} onValueChange={(v) => setTemplateId(v || undefined)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder={t("sessions.templatePlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {BUILTIN_SESSION_TEMPLATES.map((tmpl) => (
                        <SelectItem key={tmpl.id} value={tmpl.id}>
                          {tmpl.name}
                          {tmpl.description && (
                            <span className="ml-2 text-[10px] text-muted-foreground/50">{tmpl.description}</span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Claude Code 参数 */}
              {selectedTool === "claude" && (
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">{t("sessions.claudeArgs")}</label>
                  <CliArgsClaudeNext value={cliParams} onChange={setCliParams} />
                </div>
              )}

              {/* Claude 5 档模型映射 */}
              {selectedTool === "claude" && llmProviderId && (
                <div>
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
                </div>
              )}

              {/* 环境变量 */}
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {t("sessions.envVarsLabel")}
                  <span className="ml-1 text-[10px] text-muted-foreground/50">{t("sessions.envVarsLineHint")}</span>
                </label>
                <Textarea
                  className="min-h-12 font-mono text-xs"
                  rows={2}
                  placeholder={t("sessions.envVarsPlaceholder")}
                  value={envVars}
                  onChange={(e) => setEnvVars(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
