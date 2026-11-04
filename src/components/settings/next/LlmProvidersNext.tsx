/**
 * LLM 供应商管理页（新骨架，G12 / D3 / T11）。
 *
 * 供应商卡片列表（启停/默认/编辑/软删）+ 自定义新建 + 从模板添加。
 * 编辑弹窗 RHF + zod（校验与旧 AntD Form 规则对齐）；凭据字段独立 state
 * 维持「touched 才覆盖」语义，仍走原 IPC，不落明文日志。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { listLlmProviderPresets, setDefaultLlmProvider } from "@/utils/ipc";
import type { LlmProvider, PresetProviderView, AuthType } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ResponsiveDialog from "@/components/common/ResponsiveDialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import SectionHeader from "./SectionHeader";

/* ============ zod schema（校验规则与旧 AntD Form 对齐） ============ */

const providerSchema = z.object({
  name: z.string().min(1, { message: "REQUIRED" }),
  providerKind: z.enum(["anthropic", "openai", "google", "custom"]),
  authType: z.enum(["api_key", "oauth"]),
  baseUrl: z.string().optional(),
  icon: z.string().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, { message: "HEX" })
    .or(z.literal(""))
    .optional(),
  models: z.array(z.object({ value: z.string() })).min(1, { message: "MODEL" }),
  defaultModel: z.string().optional(),
});

type ProviderFormValues = z.infer<typeof providerSchema>;

const PROVIDER_KIND_LABELS: Record<ProviderFormValues["providerKind"], string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  custom: "Custom",
};

/* ============ 编辑弹窗（RHF + zod） ============ */

interface EditDialogProps {
  open: boolean;
  provider?: LlmProvider;
  onClose: () => void;
}

function LlmProviderEditDialogNext({ open, provider, onClose }: EditDialogProps) {
  const { t } = useTranslation();
  const createStore = useAppStore((s) => s.createLlmProvider);
  const updateStore = useAppStore((s) => s.updateLlmProvider);

  const form = useForm<ProviderFormValues>({
    resolver: zodResolver(providerSchema),
    defaultValues: {
      name: "",
      providerKind: "custom",
      authType: "api_key",
      baseUrl: "",
      icon: "",
      color: "",
      models: [{ value: "" }],
      defaultModel: "",
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "models" });
  const modelsWatch = form.watch("models");

  // 凭据字段独立 state：touched 才覆盖（编辑时留空保持原值）
  const [authType, setAuthType] = useState<AuthType>("api_key");
  const [apiKey, setApiKey] = useState("");
  const [apiKeyTouched, setApiKeyTouched] = useState(false);
  const [hasExistingApiKey, setHasExistingApiKey] = useState(false);
  const [oauthToken, setOauthToken] = useState("");
  const [oauthTokenTouched, setOauthTokenTouched] = useState(false);
  const [hasExistingOauthToken, setHasExistingOauthToken] = useState(false);
  const [iconOptions, setIconOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    listLlmProviderPresets()
      .then((presets) => {
        const icons = new Set<string>();
        for (const p of presets) {
          if (p.icon) icons.add(p.icon);
        }
        setIconOptions([...icons]);
      })
      .catch(() => setIconOptions([]));
  }, [open]);

  // 打开时回填（编辑取 provider 值；新建重置）
  useEffect(() => {
    if (!open) return;
    if (provider) {
      form.reset({
        name: provider.name,
        providerKind: provider.providerKind,
        authType: provider.authType,
        baseUrl: provider.baseUrl ?? "",
        icon: provider.icon ?? "",
        color: provider.color ?? "",
        models: provider.models.map((m) => ({ value: m.modelName })),
        defaultModel: provider.models.find((m) => m.isDefault)?.modelName ?? "",
      });
      setAuthType(provider.authType);
      setApiKey(provider.apiKey ?? "");
      setApiKeyTouched(false);
      setHasExistingApiKey(Boolean(provider.apiKey));
      setOauthToken(provider.oauthToken ?? "");
      setOauthTokenTouched(false);
      setHasExistingOauthToken(Boolean(provider.oauthToken));
    } else {
      form.reset({
        name: "",
        providerKind: "custom",
        authType: "api_key",
        baseUrl: "",
        icon: "",
        color: "",
        models: [{ value: "" }],
        defaultModel: "",
      });
      setAuthType("api_key");
      setApiKey("");
      setApiKeyTouched(false);
      setHasExistingApiKey(false);
      setOauthToken("");
      setOauthTokenTouched(false);
      setHasExistingOauthToken(false);
    }
  }, [open, provider, form]);

  const submit = form.handleSubmit(async (values) => {
    const cleaned = values.models.map((m) => m.value.trim()).filter(Boolean);
    const effectiveDefault =
      values.defaultModel && cleaned.includes(values.defaultModel) ? values.defaultModel : cleaned[0];
    setSaving(true);
    try {
      if (provider) {
        await updateStore(provider.id, {
          name: values.name,
          providerKind: values.providerKind,
          authType: values.authType,
          baseUrl: values.baseUrl || undefined,
          icon: values.icon || undefined,
          color: values.color || undefined,
          models: cleaned,
          defaultModel: effectiveDefault,
          apiKey: apiKeyTouched ? apiKey : undefined,
          oauthToken: oauthTokenTouched ? oauthToken : undefined,
        });
        toast.success(t("settings.providers.updated"));
      } else {
        await createStore({
          name: values.name,
          providerKind: values.providerKind,
          authType: values.authType,
          baseUrl: values.baseUrl || undefined,
          icon: values.icon || undefined,
          color: values.color || undefined,
          models: cleaned,
          defaultModel: effectiveDefault,
          apiKey: values.authType === "api_key" ? apiKey || undefined : undefined,
          oauthToken: values.authType === "oauth" ? oauthToken || undefined : undefined,
        });
        toast.success(t("settings.providers.created"));
      }
      onClose();
    } catch (err) {
      toast.error(`${t("settings.providers.saveFailed")}: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  });

  const zodText = (code?: string) => {
    if (code === "REQUIRED") return t("settings.providers.nameRequired");
    if (code === "MODEL") return t("settings.providers.modelRequired");
    if (code === "HEX") return t("settings.providers.colorInvalid");
    return t("settings.providers.invalid");
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={provider ? t("settings.providers.editTitle", { name: provider.name }) : t("settings.providers.newTitle")}
      size="md"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          <Button onClick={() => void submit()} disabled={saving}>{t("common.save")}</Button>
        </div>
      }
    >
      <Form {...form}>
        <form className="flex flex-col gap-3 py-1" onSubmit={(e) => e.preventDefault()}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.providers.name")}</FormLabel>
                <FormControl>
                  <Input placeholder={t("settings.providers.namePlaceholder")} {...field} />
                </FormControl>
                <FormMessage>{zodText(form.formState.errors.name?.message)}</FormMessage>
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              control={form.control}
              name="providerKind"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.providers.kind")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(Object.keys(PROVIDER_KIND_LABELS) as Array<keyof typeof PROVIDER_KIND_LABELS>).map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {kind === "custom" ? t("settings.providers.kindCustom") : PROVIDER_KIND_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="authType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.providers.authType")}</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(value) => {
                      field.onChange(value);
                      setAuthType(value as AuthType);
                      // 切换认证方式清除敏感字段（照旧语义）
                      setApiKey("");
                      setApiKeyTouched(false);
                      setHasExistingApiKey(false);
                      setOauthToken("");
                      setOauthTokenTouched(false);
                      setHasExistingOauthToken(false);
                    }}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="api_key">API Key</SelectItem>
                      <SelectItem value="oauth">OAuth Token</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="baseUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://api.example.com/v1" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          {authType === "api_key" ? (
            <FormItem>
              <FormLabel>{hasExistingApiKey ? t("settings.providers.apiKeySet") : "API Key"}</FormLabel>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setApiKeyTouched(true);
                }}
                placeholder={hasExistingApiKey ? t("settings.providers.credentialKeep") : t("settings.providers.apiKeyPlaceholder")}
              />
            </FormItem>
          ) : (
            <FormItem>
              <FormLabel>{hasExistingOauthToken ? t("settings.providers.oauthSet") : "OAuth Token"}</FormLabel>
              <Input
                type="password"
                value={oauthToken}
                onChange={(e) => {
                  setOauthToken(e.target.value);
                  setOauthTokenTouched(true);
                }}
                placeholder={hasExistingOauthToken ? t("settings.providers.credentialKeep") : t("settings.providers.oauthPlaceholder")}
              />
            </FormItem>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              control={form.control}
              name="icon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.providers.icon")}</FormLabel>
                  <Input list="provider-icon-options" placeholder="anthropic" {...field} />
                  <datalist id="provider-icon-options">
                    {iconOptions.map((icon) => (
                      <option key={icon} value={icon} />
                    ))}
                  </datalist>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.providers.color")}</FormLabel>
                  <FormControl>
                    <Input type="color" className="h-8 w-14 p-0.5" {...field} />
                  </FormControl>
                  <FormMessage>{zodText(form.formState.errors.color?.message)}</FormMessage>
                </FormItem>
              )}
            />
          </div>

          {/* 模型列表（useFieldArray） */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <FormLabel>{t("settings.providers.models")}</FormLabel>
              <Button type="button" variant="outline" size="xs" onClick={() => append({ value: "" })}>
                <Plus size={12} />
                {t("settings.providers.addModel")}
              </Button>
            </div>
            {fields.map((item, idx) => (
              <div key={item.id} className="flex items-center gap-2">
                <Input
                  className="h-7 flex-1 text-xs"
                  placeholder="model-id"
                  {...form.register(`models.${idx}.value` as const)}
                />
                <input
                  type="radio"
                  aria-label={t("settings.providers.defaultModel")}
                  checked={form.watch("defaultModel") === modelsWatch[idx]?.value && modelsWatch[idx]?.value !== ""}
                  disabled={!modelsWatch[idx]?.value}
                  onChange={() => form.setValue("defaultModel", modelsWatch[idx]?.value ?? "")}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("common.delete")}
                  className="text-destructive"
                  onClick={() => remove(idx)}
                >
                  ✕
                </Button>
              </div>
            ))}
            <FormMessage>{zodText(form.formState.errors.models?.message)}</FormMessage>
            <p className="text-[11px] text-muted-foreground/70">{t("settings.providers.defaultModelHint")}</p>
          </div>
        </form>
      </Form>
    </ResponsiveDialog>
  );
}

/* ============ 预设选择弹窗 ============ */

function PresetPickerNext({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const createStore = useAppStore((s) => s.createLlmProvider);
  const loadLlmProviders = useAppStore((s) => s.loadLlmProviders);
  const [presets, setPresets] = useState<PresetProviderView[]>([]);

  useEffect(() => {
    if (!open) return;
    listLlmProviderPresets()
      .then(setPresets)
      .catch(() => toast.error(t("settings.providers.presetLoadFailed")));
  }, [open, t]);

  const pick = async (preset: PresetProviderView) => {
    try {
      await createStore({
        name: preset.name,
        providerKind: preset.providerKind,
        baseUrl: preset.baseUrl,
        icon: preset.icon,
        color: preset.color,
        models: preset.models,
        defaultModel: preset.models[0],
      });
      toast.success(t("settings.providers.presetAdded", { name: preset.name }));
      await loadLlmProviders();
      onClose();
    } catch {
      toast.error(t("settings.providers.saveFailed"));
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)} title={t("settings.providers.fromPreset")} size="sm">
      <div className="grid grid-cols-1 gap-2 py-1 md:grid-cols-2">
        {presets.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => void pick(p)}
            className="rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/50"
          >
            <div className="text-[13px] font-medium">{p.name}</div>
            <div className="text-[11px] text-muted-foreground/70">
              {t("settings.providers.modelCount", { count: p.models.length })} · {p.providerKind}
            </div>
          </button>
        ))}
      </div>
    </ResponsiveDialog>
  );
}

/* ============ 主页面 ============ */

export default function LlmProvidersNext() {
  const { t } = useTranslation();
  const llmProviders = useAppStore((s) => s.llmProviders);
  const loadLlmProviders = useAppStore((s) => s.loadLlmProviders);
  const deleteStore = useAppStore((s) => s.deleteLlmProvider);
  const toggleActive = useAppStore((s) => s.toggleLlmProviderActive);

  const [showInactive, setShowInactive] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<LlmProvider | undefined>(undefined);
  const [presetOpen, setPresetOpen] = useState(false);

  const filtered = showInactive ? llmProviders : llmProviders.filter((p) => p.isActive);

  const setDefault = async (providerId: string) => {
    try {
      await setDefaultLlmProvider(providerId);
      await loadLlmProviders();
      toast.success(t("settings.providers.defaultSet"));
    } catch {
      toast.error(t("settings.providers.opFailed"));
    }
  };

  return (
    <div>
      <SectionHeader title={t("settings.providers.title")} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setEditOpen(true);
            }}
          >
            <Plus size={14} />
            {t("settings.providers.newCustom")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPresetOpen(true)}>
            {t("settings.providers.fromPreset")}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {t("settings.providers.showInactive")}
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground/60">
          {t("settings.providers.empty")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                {p.color && <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />}
                <span className="text-[13px] font-medium text-foreground/90">{p.name}</span>
                {p.isDefault && <Badge variant="secondary">{t("settings.providers.default")}</Badge>}
                {!p.isActive && <Badge variant="outline">{t("settings.providers.inactive")}</Badge>}
                <span className="ml-auto text-[11px] text-muted-foreground/70">
                  {PROVIDER_KIND_LABELS[p.providerKind]}
                </span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground/70">
                {t("settings.providers.modelCount", { count: p.models.length })} · {p.models.find((m) => m.isDefault)?.modelName ?? p.models[0]?.modelName}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Switch
                  checked={p.isActive}
                  onCheckedChange={(checked) => {
                    void toggleActive(p.id, checked).catch(() => toast.error(t("settings.providers.opFailed")));
                  }}
                />
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setEditing(p);
                    setEditOpen(true);
                  }}
                >
                  {t("common.edit")}
                </Button>
                {!p.isDefault && (
                  <Button variant="ghost" size="xs" onClick={() => void setDefault(p.id)}>
                    {t("settings.providers.setDefault")}
                  </Button>
                )}
                <div className="ml-auto">
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="xs" className="text-destructive">
                        {t("common.delete")}
                      </Button>
                    }
                    title={t("settings.providers.deleteTitle", { name: p.name })}
                    description={t("settings.providers.deleteDesc")}
                    confirmLabel={t("common.delete")}
                    destructive
                    onConfirm={() => {
                      void deleteStore(p.id)
                        .then(() => toast.success(t("settings.providers.deleted")))
                        .catch(() => toast.error(t("settings.providers.opFailed")));
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <LlmProviderEditDialogNext
        open={editOpen}
        provider={editing}
        onClose={() => {
          setEditOpen(false);
          void loadLlmProviders();
        }}
      />
      <PresetPickerNext open={presetOpen} onClose={() => setPresetOpen(false)} />
    </div>
  );
}
