/**
 * MCP 服务器配置页（新骨架，G8）。
 *
 * 服务器列表（名称/命令/参数/启用）内联 CRUD，持久化
 * localStorage「teacoder_mcpaccess_settings」，与旧页同键兼容。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLocalStorageSettings } from "./useLocalStorageSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";
import SettingsCard from "./SettingsCard";

interface McpServer {
  name: string;
  command: string;
  args: string;
  enabled: boolean;
}

interface McpAccessSettings {
  servers: McpServer[];
}

const DEFAULTS: McpAccessSettings = { servers: [] };
const EMPTY_FORM: McpServer = { name: "", command: "", args: "", enabled: true };

export default function McpAccessNext() {
  const { t } = useTranslation();
  const [settings, update] = useLocalStorageSettings<McpAccessSettings>("teacoder_mcpaccess_settings", DEFAULTS);
  const [form, setForm] = useState<McpServer>(EMPTY_FORM);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const saveServers = (servers: McpServer[]) => update({ servers });

  const startAdd = () => {
    setForm(EMPTY_FORM);
    setEditingIndex(null);
    setFormOpen(true);
  };

  const startEdit = (index: number) => {
    setForm({ ...settings.servers[index] });
    setEditingIndex(index);
    setFormOpen(true);
  };

  const submitForm = () => {
    if (!form.name.trim() || !form.command.trim()) {
      toast.warning(t("settings.mcp.formRequired"));
      return;
    }
    const next = [...settings.servers];
    const entry: McpServer = {
      name: form.name.trim(),
      command: form.command.trim(),
      args: form.args.trim(),
      enabled: form.enabled,
    };
    if (editingIndex === null) {
      next.push(entry);
    } else {
      next[editingIndex] = entry;
    }
    saveServers(next);
    setFormOpen(false);
    setEditingIndex(null);
  };

  const removeServer = (index: number) => {
    saveServers(settings.servers.filter((_, i) => i !== index));
  };

  return (
    <div>
      <SectionHeader title={t("settings.mcp.servers")} />
      <SettingsCard>
      <SettingRow id="settings.mcpList" label={t("settings.mcp.servers")} description={t("settings.mcp.serversDesc")}>
        <Button size="sm" onClick={startAdd}>
          <Plus size={14} />
          {t("settings.mcp.add")}
        </Button>
      </SettingRow>

      {settings.servers.map((server, index) => (
        <div
          key={`${server.name}-${index}`}
          className="flex items-center gap-3 rounded-md border border-border/70 px-3 py-2"
        >
          <Switch
            checked={server.enabled}
            onCheckedChange={(enabled) => {
              const next = [...settings.servers];
              next[index] = { ...server, enabled };
              saveServers(next);
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-foreground/90">{server.name}</span>
              {!server.enabled && (
                <Badge variant="outline" className="px-1 py-0 text-[9px]">
                  {t("settings.mcp.disabled")}
                </Badge>
              )}
            </div>
            <div className="truncate text-[11px] text-muted-foreground/70">
              {server.command} {server.args}
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label={t("common.edit")} onClick={() => startEdit(index)}>
            <Pencil size={14} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t("common.delete")} onClick={() => removeServer(index)}>
            <Trash2 size={14} />
          </Button>
        </div>
      ))}

      {formOpen && (
        <div className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              className="md:w-44"
              placeholder={t("settings.mcp.name")}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              className="flex-1"
              placeholder={t("settings.mcp.command")}
              value={form.command}
              onChange={(e) => setForm({ ...form, command: e.target.value })}
            />
            <Input
              className="md:w-48"
              placeholder={t("settings.mcp.args")}
              value={form.args}
              onChange={(e) => setForm({ ...form, args: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={form.enabled}
                onCheckedChange={(enabled) => setForm({ ...form, enabled })}
              />
              {t("settings.mcp.enabled")}
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button size="sm" onClick={submitForm}>
                {editingIndex === null ? t("common.add") : t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}
      </SettingsCard>
    </div>
  );
}
