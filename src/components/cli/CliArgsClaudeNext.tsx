/**
 * Claude Code 启动参数表单（新骨架，token 版）。
 *
 * 字段与序列化行为与旧 CliArgsClaude 一致：受控 Record<string,unknown>，
 * 由宿主弹窗 buildCliArgs 统一序列化为 cliArgs。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface CliArgsClaudeNextProps {
  value: Record<string, unknown>;
  onChange: (val: Record<string, unknown>) => void;
}

/** 行布局：标签 + 控件 */
function Row({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="min-w-24 flex-shrink-0 text-[11px] text-muted-foreground" title={title}>
        {label}
      </span>
      {children}
    </div>
  );
}

export default function CliArgsClaudeNext({ value, onChange }: CliArgsClaudeNextProps) {
  const { t } = useTranslation();
  const [tagsInput, setTagsInput] = useState({
    allowedTools: ((value.allowedTools as string[]) || []).join(", "),
    disallowedTools: ((value.disallowedTools as string[]) || []).join(", "),
  });

  const update = (key: string, val: unknown) => {
    onChange({ ...value, [key]: val });
  };

  const parseTagInput = (text: string): string[] =>
    text.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);

  const handleMcpConfigBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (selected && typeof selected === "string") {
        update("mcpConfig", selected);
      }
    } catch {
      // 用户取消
    }
  };

  return (
    <div>
      <Row label={t("sessions.claude.skipPerms")} title={t("sessions.claude.skipPermsTitle")}>
        <Switch
          checked={Boolean(value.dangerouslySkipPermissions)}
          onCheckedChange={(v) => update("dangerouslySkipPermissions", v || undefined)}
        />
      </Row>
      <Row label={t("sessions.claude.allowedTools")} title={t("sessions.claude.allowedToolsTitle")}>
        <Input
          className="h-7 flex-1 text-xs"
          placeholder="Bash, Read, Write..."
          value={tagsInput.allowedTools}
          onChange={(e) => {
            setTagsInput((prev) => ({ ...prev, allowedTools: e.target.value }));
            update("allowedTools", parseTagInput(e.target.value));
          }}
        />
      </Row>
      <Row label={t("sessions.claude.disallowedTools")} title={t("sessions.claude.disallowedToolsTitle")}>
        <Input
          className="h-7 flex-1 text-xs"
          placeholder="Bash, Edit..."
          value={tagsInput.disallowedTools}
          onChange={(e) => {
            setTagsInput((prev) => ({ ...prev, disallowedTools: e.target.value }));
            update("disallowedTools", parseTagInput(e.target.value));
          }}
        />
      </Row>
      <Row label={t("sessions.claude.maxTurns")} title={t("sessions.claude.maxTurnsTitle")}>
        <Input
          className="h-7 w-24 text-xs"
          type="number"
          min={1}
          max={1000}
          placeholder={t("sessions.claude.unlimited")}
          value={(value.maxTurns as number) || ""}
          onChange={(e) => update("maxTurns", Number(e.target.value) || undefined)}
        />
      </Row>
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-1.5 min-w-24 flex-shrink-0 text-[11px] text-muted-foreground" title={t("sessions.claude.appendPromptTitle")}>
          {t("sessions.claude.appendPrompt")}
        </span>
        <Textarea
          className="min-h-12 flex-1 font-mono text-xs"
          rows={2}
          placeholder={t("sessions.claude.appendPromptPlaceholder")}
          value={(value.appendSystemPrompt as string) || ""}
          onChange={(e) => update("appendSystemPrompt", e.target.value || undefined)}
        />
      </div>
      <Row label={t("sessions.claude.verbose")} title={t("sessions.claude.verboseTitle")}>
        <Switch
          checked={Boolean(value.verbose)}
          onCheckedChange={(v) => update("verbose", v || undefined)}
        />
      </Row>
      <Row label={t("sessions.claude.mcpConfig")} title={t("sessions.claude.mcpConfigTitle")}>
        <div className="flex flex-1 gap-1.5">
          <Input
            className="h-7 flex-1 text-xs"
            placeholder="~/.config/claude/mcp.json"
            value={(value.mcpConfig as string) || ""}
            onChange={(e) => update("mcpConfig", e.target.value || undefined)}
          />
          <ButtonLikeIcon onClick={() => void handleMcpConfigBrowse()} label={t("sessions.browse")} />
        </div>
      </Row>
    </div>
  );
}

function ButtonLikeIcon({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <FolderOpen size={13} />
    </button>
  );
}
