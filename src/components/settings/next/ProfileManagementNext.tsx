/**
 * Profile 管理页（新骨架，G13 / D1 / T11）。
 *
 * Profile 列表（工具徽标/颜色/描述）+ 新建/编辑弹窗（RHF + zod）+ 删除。
 * 凭据走原 IPC（getProfileCredential 掩码回显，updateProfile 原样提交由后端
 * 判定覆盖），不落明文日志——存储分层不变（Keychain）。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { createProfile, updateProfile, deleteProfile, getProfileCredential, listProfiles } from "@/utils/ipc";
import { TOOL_DISPLAY_NAMES } from "@/types";
import type { ToolType, Profile } from "@/types";
import { Badge } from "@/components/ui/badge";
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

/* ============ 表单弹窗 ============ */

interface ProfileDialogProps {
  open: boolean;
  editingProfile: Profile | null;
  onClose: () => void;
}

function ProfileDialogNext({ open, editingProfile, onClose }: ProfileDialogProps) {
  const { t } = useTranslation();
  const setProfiles = useAppStore((s) => s.setProfiles);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      toolType: "claude",
      authType: "api_key",
      baseUrl: "",
      appDataRoot: "",
      color: COLOR_PRESETS[0],
      description: "",
    },
  });
  const authType = form.watch("authType");
  const toolType = form.watch("toolType");

  const [credential, setCredential] = useState("");
  const [credentialTouched, setCredentialTouched] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCredentialTouched(false);
    if (editingProfile) {
      form.reset({
        name: editingProfile.name,
        toolType: editingProfile.toolType,
        authType: editingProfile.authType,
        baseUrl: editingProfile.baseUrl ?? "",
        appDataRoot: editingProfile.appDataRoot ?? "",
        color: editingProfile.color || COLOR_PRESETS[0],
        description: editingProfile.description ?? "",
      });
      setHasExisting(false);
      setCredential("");
      // 凭据掩码回显（仅提示「已设置」，掩码原样保留可提交）
      const keyName = editingProfile.authType === "api_key" ? "api_key" : "oauth_token";
      getProfileCredential(editingProfile.id, keyName)
        .then((masked) => {
          if (masked) {
            setCredential(masked);
            setHasExisting(true);
          }
        })
        .catch(() => {
          // 凭据读取失败按无处理
        });
    } else {
      form.reset({
        name: "",
        toolType: "claude",
        authType: "api_key",
        baseUrl: "",
        appDataRoot: "",
        color: COLOR_PRESETS[0],
        description: "",
      });
      setCredential("");
      setHasExisting(false);
    }
  }, [open, editingProfile, form]);

  const submit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      if (editingProfile) {
        await updateProfile(editingProfile.id, { ...values, apiKey: credential || undefined });
      } else {
        await createProfile({
          ...values,
          apiKey: values.authType === "api_key" ? credential || undefined : undefined,
          oauthToken: values.authType === "oauth" ? credential || undefined : undefined,
        });
      }
      const updated = await listProfiles();
      setProfiles(updated);
      toast.success(t("settings.profiles.saved"));
      onClose();
    } catch (err) {
      toast.error(`${t("settings.profiles.opFailed")}: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  });

  const zodText = (code?: string) =>
    code === "REQUIRED" ? t("settings.providers.nameRequired") : t("settings.providers.invalid");

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title={editingProfile ? t("settings.profiles.editTitle", { name: editingProfile.name }) : t("settings.profiles.newTitle")}
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
                  <Input {...field} />
                </FormControl>
                <FormMessage>{zodText(form.formState.errors.name?.message)}</FormMessage>
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              control={form.control}
              name="toolType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.profiles.toolType")}</FormLabel>
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
          </div>
          {authType === "api_key" ? (
            <FormItem>
              <FormLabel>{hasExisting ? t("settings.providers.apiKeySet") : "API Key"}</FormLabel>
              <Input
                type="password"
                value={credential}
                onChange={(e) => {
                  setCredential(e.target.value);
                  setCredentialTouched(true);
                }}
                placeholder={hasExisting ? t("settings.providers.credentialKeep") : t("settings.providers.apiKeyPlaceholder")}
              />
            </FormItem>
          ) : (
            <FormItem>
              <FormLabel>{hasExisting ? t("settings.providers.oauthSet") : "OAuth Token"}</FormLabel>
              <Input
                type="password"
                value={credential}
                onChange={(e) => {
                  setCredential(e.target.value);
                  setCredentialTouched(true);
                }}
                placeholder={hasExisting ? t("settings.providers.credentialKeep") : t("settings.providers.oauthPlaceholder")}
              />
            </FormItem>
          )}
          <FormField
            control={form.control}
            name="baseUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Base URL</FormLabel>
                <FormControl>
                  <Input placeholder="https://api.example.com" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          {toolType === "claude" && (
            <FormField
              control={form.control}
              name="appDataRoot"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.profiles.appDataRoot")}</FormLabel>
                  <FormControl>
                    <Input placeholder="~/.nova/profiles/<id>/claude-data" {...field} />
                  </FormControl>
                  <p className="text-[11px] text-muted-foreground/70">
                    {t("settings.profiles.envHint", { env: ENV_HINTS[toolType] })}
                  </p>
                </FormItem>
              )}
            />
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("settings.providers.color")}</FormLabel>
                  <div className="flex gap-1.5">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={color}
                        onClick={() => field.onChange(color)}
                        className={`h-6 w-6 rounded-md border-2 transition-transform hover:scale-105 ${
                          field.value === color ? "border-foreground" : "border-transparent"
                        }`}
                        style={{ background: color }}
                      />
                    ))}
                  </div>
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("settings.profiles.description")}</FormLabel>
                <FormControl>
                  <Textarea className="min-h-16" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          {/* credentialTouched 仅标记交互；掩码提交语义由后端判定 */}
          <span className="hidden">{credentialTouched ? "" : ""}</span>
        </form>
      </Form>
    </ResponsiveDialog>
  );
}

/* ============ 主页面 ============ */

export default function ProfileManagementNext() {
  const { t } = useTranslation();
  const profiles = useAppStore((s) => s.profiles);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);

  return (
    <div>
      <SectionHeader title={t("settings.profiles.title")} />
      <div className="mb-4">
        <Button
          size="sm"
          onClick={() => {
            setEditingProfile(null);
            setDialogOpen(true);
          }}
        >
          <Plus size={14} />
          {t("settings.profiles.new")}
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground/60">
          {t("settings.profiles.empty")}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              {p.color && <span aria-hidden className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: p.color }} />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground/90">{p.name}</span>
                  <Badge variant="outline">{TOOL_DISPLAY_NAMES[p.toolType]}</Badge>
                  <Badge variant="secondary">{p.authType === "api_key" ? "API Key" : "OAuth"}</Badge>
                </div>
                {p.description && (
                  <div className="truncate text-[11px] text-muted-foreground/70">{p.description}</div>
                )}
              </div>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  setEditingProfile(p);
                  setDialogOpen(true);
                }}
              >
                {t("common.edit")}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="xs" className="text-destructive">
                    {t("common.delete")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("settings.profiles.deleteTitle", { name: p.name })}</AlertDialogTitle>
                    <AlertDialogDescription>{t("settings.profiles.deleteDesc")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-white hover:bg-destructive/90"
                      onClick={() => {
                        void deleteProfile(p.id, { removeData: false })
                          .then(() => toast.success(t("settings.profiles.deleted")))
                          .catch(() => toast.error(t("settings.profiles.opFailed")));
                      }}
                    >
                      {t("common.delete")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}

      <ProfileDialogNext
        open={dialogOpen}
        editingProfile={editingProfile}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
