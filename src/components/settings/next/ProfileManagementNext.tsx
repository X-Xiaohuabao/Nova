/**
 * Profile 管理页（新骨架，G13 / D1 / T11）。
 *
 * master-detail 双栏（macOS Terminal.app「描述文件」同款交互）：左侧列表卡
 * （底部 + 新建 / − 删除选中），右侧表单常驻且复用 SettingRow 设置行
 * （label 左 / 控件右，<768px 堆叠）——点行选中即编辑，不弹框；
 * 仅破坏性操作（删除确认、放弃未保存修改）保留 AlertDialog（HIG 7.5）。
 * 凭据走原 IPC（getProfileCredential 掩码回显，updateProfile 原样提交由后端
 * 判定覆盖），不落明文日志——存储分层不变（Keychain）。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft, FolderOpen, Minus, Plus } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { createProfile, updateProfile, deleteProfile, getProfileCredential, listProfiles } from "@/utils/ipc";
import { TOOL_DISPLAY_NAMES } from "@/types";
import type { ToolType, Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import SettingRow from "./SettingRow";

const COLOR_PRESETS = ["#1677ff", "#52c41a", "#faad14", "#ff4d4f", "#722ed1", "#13c2c2", "#eb2f96", "#fa8c16"];

const profileSchema = z.object({
  name: z.string().min(1, { message: "REQUIRED" }),
  toolType: z.enum(["claude", "codex", "gemini", "opencode", "antigravity", "terminal", "ssh"]),
  authType: z.enum(["api_key", "oauth"]),
  baseUrl: z.string().optional(),
  appDataRoot: z.string().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const FORM_DEFAULTS: ProfileFormValues = {
  name: "",
  toolType: "claude",
  authType: "api_key",
  baseUrl: "",
  appDataRoot: "",
  color: COLOR_PRESETS[0],
  description: "",
};

/** 控件统一宽度（SettingRow 右栏 ~296px 可用宽内取值） */
const CONTROL_W = "w-full md:w-[280px]";

/** 各工具的数据隔离目录提示（与旧页一致） */
const ENV_HINTS: Record<ToolType, string> = {
  claude: "CLAUDE_CONFIG_DIR",
  codex: "CODEX_HOME",
  gemini: "GEMINI_CLI_HOME",
  opencode: "OPENCODE_HOME",
  antigravity: "ANTIGRAVITY_HOME",
  terminal: "—",
  ssh: "—",
};

export default function ProfileManagementNext() {
  const { t } = useTranslation();
  const profiles = useAppStore((s) => s.profiles);
  const setProfiles = useAppStore((s) => s.setProfiles);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  /** 移动端（<768px）单栏视图：列表 / 表单互斥显示 */
  const [mobilePane, setMobilePane] = useState<"list" | "form">("list");
  /** 放弃修改确认框挂起的导航动作（有值即打开确认框） */
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    mode: "onTouched",
    defaultValues: FORM_DEFAULTS,
  });
  const authType = form.watch("authType");
  const toolType = form.watch("toolType");

  const [credential, setCredential] = useState("");
  const [credentialTouched, setCredentialTouched] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedProfile = profiles.find((p) => p.id === selectedId) ?? null;
  const editingProfile = creating ? null : selectedProfile;
  const dirty = form.formState.isDirty || credentialTouched;
  const nameError = form.formState.errors.name;

  /** 表单回填为某 Profile 的已存值 */
  const resetToProfile = (profile: Profile) => {
    form.reset({
      name: profile.name,
      toolType: profile.toolType,
      authType: profile.authType,
      baseUrl: profile.baseUrl ?? "",
      appDataRoot: profile.appDataRoot ?? "",
      color: profile.color || COLOR_PRESETS[0],
      description: profile.description ?? "",
    });
  };

  /** 凭据掩码回显（仅提示「已设置」，掩码原样保留可提交） */
  const loadCredential = (profile: Profile) => {
    setCredential("");
    setHasExisting(false);
    const keyName = profile.authType === "api_key" ? "api_key" : "oauth_token";
    getProfileCredential(profile.id, keyName)
      .then((masked) => {
        if (masked) {
          setCredential(masked);
          setHasExisting(true);
        }
      })
      .catch(() => {
        // 凭据读取失败按无处理
      });
  };

  // 选中/模式变化：同步表单与凭据掩码（保存/删除引发的 profiles 更新也会走到这里）
  useEffect(() => {
    setCredentialTouched(false);
    if (selectedProfile) {
      resetToProfile(selectedProfile);
      loadCredential(selectedProfile);
    } else {
      form.reset(FORM_DEFAULTS);
      setCredential("");
      setHasExisting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedProfile 由 selectedId+profiles 派生，profiles 变化（保存/删除）需重新同步表单
  }, [selectedId, creating, profiles, form]);

  /** 带脏表单守卫的导航：有未保存修改时先弹放弃确认 */
  const requestNav = (action: () => void) => {
    if (dirty) {
      setDiscardAction(() => action);
    } else {
      action();
    }
  };

  const selectProfile = (id: string) => {
    if (!creating && id === selectedId) return;
    requestNav(() => {
      setCreating(false);
      setSelectedId(id);
      setMobilePane("form");
    });
  };

  const startCreate = () => {
    requestNav(() => {
      setCreating(true);
      setSelectedId(null);
      setMobilePane("form");
    });
  };

  /** 移动端返回列表（保留编辑态，iOS push/pop 语义） */
  const backToList = () => setMobilePane("list");

  /** 取消：新建回列表；编辑还原为已存值（保持选中） */
  const cancelEditing = () => {
    requestNav(() => {
      setCredentialTouched(false);
      if (creating) {
        setCreating(false);
        setMobilePane("list");
      } else if (selectedProfile) {
        resetToProfile(selectedProfile);
        loadCredential(selectedProfile);
      }
    });
  };

  const confirmDelete = () => {
    if (!selectedProfile) return;
    void deleteProfile(selectedProfile.id, { removeData: false })
      .then(async () => {
        setProfiles(await listProfiles());
        toast.success(t("settings.profiles.deleted"));
        setSelectedId(null);
        setMobilePane("list");
      })
      .catch(() => toast.error(t("settings.profiles.opFailed")));
  };

  const submit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      if (creating) {
        const created = await createProfile({
          ...values,
          apiKey: values.authType === "api_key" ? credential || undefined : undefined,
          oauthToken: values.authType === "oauth" ? credential || undefined : undefined,
        });
        setProfiles(await listProfiles());
        setCredentialTouched(false);
        setCreating(false);
        setSelectedId(created.id); // effect：回填已存值并回显凭据掩码
        toast.success(t("settings.profiles.saved"));
      } else if (selectedProfile) {
        await updateProfile(selectedProfile.id, { ...values, apiKey: credential || undefined });
        setProfiles(await listProfiles());
        setCredentialTouched(false);
        toast.success(t("settings.profiles.saved"));
      }
    } catch (err) {
      toast.error(`${t("settings.profiles.opFailed")}: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  });

  const zodText = (code?: string) =>
    code === "REQUIRED" ? t("settings.providers.nameRequired") : t("settings.providers.invalid");

  return (
    <div>
      <div className="flex items-start gap-4">
        {/* 左：Profile 列表卡 */}
        <div
          className={cn(
            "flex w-full flex-shrink-0 flex-col overflow-hidden rounded-xl border border-border/40 bg-card md:w-[220px]",
            mobilePane === "form" && "hidden md:flex",
          )}
        >
          {profiles.length === 0 ? (
            <div className="px-3 py-8 text-center text-[11px] text-muted-foreground/60">
              {t("settings.profiles.empty")}
            </div>
          ) : (
            <ul className="flex flex-col gap-0.5 p-1.5">
              {profiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectProfile(p.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                      !creating && p.id === selectedId
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60",
                    )}
                  >
                    {p.color ? (
                      <span aria-hidden className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: p.color }} />
                    ) : (
                      <span aria-hidden className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-border" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium leading-4 text-foreground/90">{p.name}</span>
                      <span className="block truncate text-[11px] leading-4 text-muted-foreground/70">
                        {TOOL_DISPLAY_NAMES[p.toolType]} · {p.authType === "api_key" ? "API Key" : "OAuth"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* 底部 +/−（Terminal.app source list 惯例：+ 新建，− 删除选中） */}
          <div className="flex items-center gap-1 border-t border-border/40 p-1.5">
            <Button variant="ghost" size="icon-sm" onClick={startCreate} aria-label={t("settings.profiles.new")}>
              <Plus size={14} />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={!selectedProfile} aria-label={t("common.delete")}>
                  <Minus size={14} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("settings.profiles.deleteTitle", { name: selectedProfile?.name ?? "" })}
                  </AlertDialogTitle>
                  <AlertDialogDescription>{t("settings.profiles.deleteDesc")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={confirmDelete}
                  >
                    {t("common.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* 右：表单常驻区（设置行样式，label 左 / 控件右） */}
        <div className={cn("min-w-0 flex-1", mobilePane === "form" ? "block" : "hidden md:block")}>
          {editingProfile || creating ? (
            <div className="overflow-hidden rounded-xl border border-border/40 bg-card">
              {/* 头部：移动端返回 + 标题（桌面端由列表选中态提供上下文） */}
              <div className="flex items-center gap-1.5 px-4 py-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="md:hidden"
                  onClick={backToList}
                  aria-label={t("settings.profiles.backToList")}
                >
                  <ChevronLeft size={14} />
                </Button>
                <h3 className="text-[13px] font-semibold text-foreground/90">
                  {creating
                    ? t("settings.profiles.newTitle")
                    : t("settings.profiles.editTitle", { name: editingProfile?.name ?? "" })}
                </h3>
              </div>

              <Form {...form}>
                <form className="divide-y divide-border/40" onSubmit={(e) => e.preventDefault()}>
                  <SettingRow label={t("settings.providers.name")}>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem className={CONTROL_W}>
                          <FormControl>
                            <Input {...field} aria-label={t("settings.providers.name")} />
                          </FormControl>
                          {nameError && <FormMessage>{zodText(nameError.message)}</FormMessage>}
                        </FormItem>
                      )}
                    />
                  </SettingRow>
                  <SettingRow label={t("settings.profiles.toolType")}>
                    <FormField
                      control={form.control}
                      name="toolType"
                      render={({ field }) => (
                        <FormItem className={CONTROL_W}>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {(Object.keys(TOOL_DISPLAY_NAMES) as ToolType[]).map((tool) => (
                                <SelectItem key={tool} value={tool}>{TOOL_DISPLAY_NAMES[tool]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </SettingRow>
                  <SettingRow label={t("settings.providers.authType")}>
                    <FormField
                      control={form.control}
                      name="authType"
                      render={({ field }) => (
                        <FormItem className={CONTROL_W}>
                          <Select
                            value={field.value}
                            onValueChange={(value) => {
                              field.onChange(value);
                              setCredential("");
                              setCredentialTouched(false);
                              setHasExisting(false);
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
                  </SettingRow>
                  <SettingRow
                    label={
                      authType === "api_key"
                        ? hasExisting ? t("settings.providers.apiKeySet") : "API Key"
                        : hasExisting ? t("settings.providers.oauthSet") : "OAuth Token"
                    }
                  >
                    <Input
                      type="password"
                      className={CONTROL_W}
                      value={credential}
                      onChange={(e) => {
                        setCredential(e.target.value);
                        setCredentialTouched(true);
                      }}
                      placeholder={hasExisting ? t("settings.providers.credentialKeep") : authType === "api_key" ? t("settings.providers.apiKeyPlaceholder") : t("settings.providers.oauthPlaceholder")}
                      aria-label={authType === "api_key" ? "API Key" : "OAuth Token"}
                    />
                  </SettingRow>
                  <SettingRow label="Base URL">
                    <FormField
                      control={form.control}
                      name="baseUrl"
                      render={({ field }) => (
                        <FormItem className={CONTROL_W}>
                          <FormControl>
                            <Input placeholder="https://api.example.com" {...field} aria-label="Base URL" />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </SettingRow>
                  {toolType === "claude" && (
                    <SettingRow
                      label={t("settings.profiles.appDataRoot")}
                      description={t("settings.profiles.envHint", { env: ENV_HINTS[toolType] })}
                    >
                      <FormField
                        control={form.control}
                        name="appDataRoot"
                        render={({ field }) => (
                          <FormItem className={CONTROL_W}>
                            <FormControl>
                              <Input placeholder="~/.nova/profiles/<id>/claude-data" {...field} aria-label={t("settings.profiles.appDataRoot")} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </SettingRow>
                  )}
                  <SettingRow label={t("settings.providers.color")}>
                    <FormField
                      control={form.control}
                      name="color"
                      render={({ field }) => (
                        <div className="flex gap-1.5">
                          {COLOR_PRESETS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              aria-label={color}
                              onClick={() => field.onChange(color)}
                              className={cn(
                                "h-6 w-6 rounded-md border-2 transition-opacity hover:opacity-80",
                                field.value === color ? "border-foreground" : "border-transparent",
                              )}
                              style={{ background: color }}
                            />
                          ))}
                        </div>
                      )}
                    />
                  </SettingRow>
                  <SettingRow label={t("settings.profiles.description")}>
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className={CONTROL_W}>
                          <FormControl>
                            <Textarea className="min-h-16" {...field} aria-label={t("settings.profiles.description")} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </SettingRow>
                  {/* 操作行：取消 / 保存 */}
                  <div className="flex items-center justify-end gap-2 px-4 py-2.5">
                    <Button variant="outline" onClick={cancelEditing}>{t("common.cancel")}</Button>
                    <Button onClick={() => void submit()} disabled={saving || !form.formState.isValid}>
                      {t("common.save")}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          ) : (
            <div className="flex h-44 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/40 text-muted-foreground/60">
              <FolderOpen size={20} strokeWidth={2} />
              <p className="text-[11px]">{t("settings.profiles.selectHint")}</p>
            </div>
          )}
        </div>
      </div>

      {/* 放弃未保存修改确认（切换/新建/取消且表单有改动时） */}
      <AlertDialog open={discardAction !== null} onOpenChange={(o) => { if (!o) setDiscardAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.profiles.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.profiles.discardDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                discardAction?.();
                setDiscardAction(null);
              }}
            >
              {t("settings.profiles.discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
