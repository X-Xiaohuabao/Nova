/**
 * 六个 CLI 工具设置页（新骨架，G3）。
 *
 * 全部为 ToolSettingsPageNext 的声明式薄壳：字段/默认值与旧各页对齐；
 * Claude/Codex 附带快捷命令编辑器，CliShell 为 terminalSettings 环境变量页。
 */

import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import { Textarea } from "@/components/ui/textarea";
import ToolSettingsPageNext from "./ToolSettingsPageNext";
import type { FieldDef } from "./ToolSettingsPageNext";
import QuickCommandsEditorNext from "./QuickCommandsEditorNext";
import SettingRow from "./SettingRow";
import SectionHeader from "./SectionHeader";
import SettingsCard from "./SettingsCard";

/* ============ Claude ============ */

const CLAUDE_FIELDS: FieldDef[] = [
  { key: "autoSubmit", labelKey: "settings.claude.autoSubmit", descKey: "settings.claude.autoSubmitDesc", groupKey: "settings.claudeBehavior", type: "switch" },
  { key: "permissionMode", labelKey: "settings.claude.permissionMode", descKey: "settings.claude.permissionModeDesc", groupKey: "settings.claudeBehavior", type: "select", options: [
    { value: "default", labelKey: "settings.perm.default" },
    { value: "relaxed", labelKey: "settings.perm.relaxed" },
    { value: "strict", labelKey: "settings.perm.strict" },
  ] },
  { key: "maxOutputLength", labelKey: "settings.claude.maxOutputLength", descKey: "settings.claude.maxOutputLengthDesc", groupKey: "settings.claudeBehavior", type: "number", min: 1024, max: 65536, step: 1024 },
  { key: "customInstructions", labelKey: "settings.claude.customInstructions", descKey: "settings.claude.customInstructionsDesc", groupKey: "settings.claudeInstructions", type: "textarea", placeholderKey: "settings.claude.customInstructionsPlaceholder" },
];

export function ClaudeSettingsNext() {
  return (
    <ToolSettingsPageNext
      toolType="claude"
      toolLabel="Claude Code"
      defaults={{ autoSubmit: false, permissionMode: "default", maxOutputLength: 8192, customInstructions: "" }}
      fields={CLAUDE_FIELDS}
      extra={<QuickCommandsEditorNext toolType="claude" />}
    />
  );
}

/* ============ Codex ============ */

const CODEX_FIELDS: FieldDef[] = [
  { key: "autoApprove", labelKey: "settings.codex.autoApprove", descKey: "settings.codex.autoApproveDesc", groupKey: "settings.claudeBehavior", type: "switch" },
  { key: "sandboxMode", labelKey: "settings.codex.sandboxMode", descKey: "settings.codex.sandboxModeDesc", groupKey: "settings.claudeBehavior", type: "select", options: [
    { value: "disabled", labelKey: "settings.sandbox.disabled" },
    { value: "strict", labelKey: "settings.sandbox.strict" },
    { value: "relaxed", labelKey: "settings.sandbox.relaxed" },
  ] },
];

export function CodexSettingsNext() {
  return (
    <ToolSettingsPageNext
      toolType="codex"
      toolLabel="Codex CLI"
      defaults={{ autoApprove: false, sandboxMode: "strict" }}
      fields={CODEX_FIELDS}
      extra={<QuickCommandsEditorNext toolType="codex" />}
    />
  );
}

/* ============ Gemini ============ */

const GEMINI_FIELDS: FieldDef[] = [
  { key: "autoExecute", labelKey: "settings.gemini.autoExecute", descKey: "settings.gemini.autoExecuteDesc", groupKey: "settings.claudeBehavior", type: "switch" },
  { key: "safetyLevel", labelKey: "settings.gemini.safetyLevel", descKey: "settings.gemini.safetyLevelDesc", groupKey: "settings.claudeBehavior", type: "select", options: [
    { value: "default", labelKey: "settings.perm.default" },
    { value: "strict", labelKey: "settings.perm.strict" },
    { value: "relaxed", labelKey: "settings.perm.relaxed" },
  ] },
];

export function GeminiSettingsNext() {
  return (
    <ToolSettingsPageNext
      toolType="gemini"
      toolLabel="Gemini CLI"
      defaults={{ autoExecute: false, safetyLevel: "default" }}
      fields={GEMINI_FIELDS}
    />
  );
}

/* ============ OpenCode ============ */

const OPENCODE_FIELDS: FieldDef[] = [
  { key: "autoExecute", labelKey: "settings.opencode.autoExecute", descKey: "settings.opencode.autoExecuteDesc", groupKey: "settings.claudeBehavior", type: "switch" },
];

export function OpenCodeSettingsNext() {
  return (
    <ToolSettingsPageNext
      toolType="opencode"
      toolLabel="OpenCode"
      defaults={{ autoExecute: false }}
      fields={OPENCODE_FIELDS}
    />
  );
}

/* ============ Antigravity ============ */

const ANTIGRAVITY_FIELDS: FieldDef[] = [
  { key: "apiKey", labelKey: "settings.antigravity.apiKey", descKey: "settings.antigravity.apiKeyDesc", groupKey: "settings.claudeBehavior", type: "password" },
  { key: "endpoint", labelKey: "settings.antigravity.endpoint", groupKey: "settings.claudeBehavior", type: "text" },
  { key: "autoCommit", labelKey: "settings.antigravity.autoCommit", descKey: "settings.antigravity.autoCommitDesc", groupKey: "settings.claudeBehavior", type: "switch" },
];

export function AntigravitySettingsNext() {
  return (
    <ToolSettingsPageNext
      toolType="antigravity"
      toolLabel="Antigravity"
      defaults={{ apiKey: "", endpoint: "", autoCommit: false }}
      fields={ANTIGRAVITY_FIELDS}
    />
  );
}

/* ============ CliShell（terminal/ssh 通用：环境变量 + 快捷命令） ============ */

interface CliShellSettingsNextProps {
  /** shell 类工具（terminal / ssh），决定快捷命令的归属 */
  toolType: string;
}

export function CliShellSettingsNext({ toolType }: CliShellSettingsNextProps) {
  const { t } = useTranslation();
  const envVars = useAppStore((s) => s.terminalSettings.envVars);
  const updateSetting = useAppStore((s) => s.updateTerminalSetting);

  return (
    <div>
      <SectionHeader title={t("settings.cliShellEnvVars")} />
      <SettingsCard>
        <SettingRow
          id="settings.envVars"
          label={t("settings.cliShellEnvVars")}
          description={t("settings.cliShellEnvVarsDesc")}
        >
          <Textarea
            className="min-h-20 w-full font-mono text-xs md:w-80"
            placeholder={"NODE_OPTIONS=--max-old-space-size=4096\nPYTHONPATH=/usr/local/lib/python3.9"}
            value={envVars}
            onChange={(e) => updateSetting("envVars", e.target.value)}
          />
        </SettingRow>
      </SettingsCard>
      <QuickCommandsEditorNext toolType={toolType} />
    </div>
  );
}
