/**
 * 设置中心框架（新骨架，规范：doc/design-ui-patterns.md 第 1 章）。
 *
 * - 左侧分类导航 200px（6 组），右内容面板 max-w 640 居中、独立滚动
 * - 顶部搜索：静态索引（页名 + 设置项标签，渲染期 t() 取两语言当前语言）；
 *   命中下拉 → 点击切页 + 滚动定位 + 高亮 1.5s
 * - <768px：导航收为顶部 Select 切页；SettingRow 上下堆叠（见 SettingRow）
 * - 未迁移页面（T10~T13 批次）展示「迁移中」禁用态，框架先行
 * - 界面缩放/字体在此应用生效（--ui-zoom，与旧 AppLayout 同逻辑）
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import GeneralSettingsNext from "./GeneralSettingsNext";
import TerminalSettingsNext from "./TerminalSettingsNext";
import {
  ClaudeSettingsNext,
  CodexSettingsNext,
  GeminiSettingsNext,
  OpenCodeSettingsNext,
  AntigravitySettingsNext,
  CliShellSettingsNext,
} from "./CliSettingsPages";
import NetworkSettingsNext from "./NetworkSettingsNext";
import NotificationSettingsNext from "./NotificationSettingsNext";
import DataManagementNext from "./DataManagementNext";
import McpAccessNext from "./McpAccessNext";
import AboutNext from "./AboutNext";
import KeybindingsSettingsNext from "./KeybindingsSettingsNext";
import RemoteAccessNext from "./RemoteAccessNext";
import LlmProvidersNext from "./LlmProvidersNext";
import ProfileManagementNext from "./ProfileManagementNext";

/* ============ 页面注册表（按 design-ui-patterns 1.2 分组定稿） ============ */

interface SettingsPageDef {
  key: string;
  groupKey: string;
  labelKey: string;
  /** 未迁移页（批次挂载后移除标记） */
  migrating?: boolean;
  /** 已迁移页面组件（接收搜索高亮锚点） */
  render?: (highlightKey?: string) => ReactNode;
  /** 搜索索引：本页设置项的 i18n 标签键 */
  itemKeys?: string[];
}

const CLI_ITEM_KEYS = ["settings.model", "settings.quickCommands"];

const PAGES: SettingsPageDef[] = [
  { key: "general", groupKey: "groupGeneral", labelKey: "settings.pageGeneral", render: (h) => <GeneralSettingsNext highlightKey={h} />, itemKeys: ["settings.theme", "settings.uiZoom", "settings.uiFont", "settings.language"] },
  { key: "keybindings", groupKey: "groupGeneral", labelKey: "settings.pageKeybindings", render: () => <KeybindingsSettingsNext />, itemKeys: ["settings.keybindings.showHide", "settings.keybindings.copy", "settings.keybindings.undo", "settings.keybindings.openSettings"] },
  { key: "terminal", groupKey: "groupCli", labelKey: "settings.pageTerminal", render: (h) => <TerminalSettingsNext highlightKey={h} />, itemKeys: ["settings.shell", "settings.terminalFont", "settings.terminalFontSize", "settings.colorTheme", "settings.cursorStyle", "settings.scrollback", "settings.bell", "settings.envVars"] },
  { key: "claude", groupKey: "groupCli", labelKey: "settings.pageClaude", render: () => <ClaudeSettingsNext />, itemKeys: [...CLI_ITEM_KEYS, "settings.claude.autoSubmit", "settings.claude.permissionMode", "settings.claude.maxOutputLength", "settings.claude.customInstructions"] },
  { key: "codex", groupKey: "groupCli", labelKey: "settings.pageCodex", render: () => <CodexSettingsNext />, itemKeys: [...CLI_ITEM_KEYS, "settings.codex.autoApprove", "settings.codex.sandboxMode"] },
  { key: "gemini", groupKey: "groupCli", labelKey: "settings.pageGemini", render: () => <GeminiSettingsNext />, itemKeys: [...CLI_ITEM_KEYS, "settings.gemini.autoExecute", "settings.gemini.safetyLevel"] },
  { key: "opencode", groupKey: "groupCli", labelKey: "settings.pageOpenCode", render: () => <OpenCodeSettingsNext />, itemKeys: [...CLI_ITEM_KEYS, "settings.opencode.autoExecute"] },
  { key: "antigravity", groupKey: "groupCli", labelKey: "settings.pageAntigravity", render: () => <AntigravitySettingsNext />, itemKeys: [...CLI_ITEM_KEYS, "settings.antigravity.apiKey", "settings.antigravity.endpoint", "settings.antigravity.autoCommit"] },
  { key: "clishell", groupKey: "groupCli", labelKey: "settings.pageCliShell", render: () => <CliShellSettingsNext toolType="terminal" />, itemKeys: ["settings.cliShellEnvVars", "settings.quickCommands"] },
  { key: "mcp", groupKey: "groupCli", labelKey: "settings.pageMcp", render: () => <McpAccessNext />, itemKeys: ["settings.mcp.servers"] },
  { key: "llm-providers", groupKey: "groupProviders", labelKey: "settings.pageLlmProviders", render: () => <LlmProvidersNext />, itemKeys: ["settings.providers.newCustom", "settings.providers.fromPreset"] },
  { key: "profile-management", groupKey: "groupProviders", labelKey: "settings.pageProfileManagement", render: () => <ProfileManagementNext />, itemKeys: ["settings.profiles.new", "settings.profiles.toolType"] },
  { key: "network", groupKey: "groupNetwork", labelKey: "settings.pageNetwork", render: () => <NetworkSettingsNext />, itemKeys: ["settings.net.enableProxy", "settings.net.proxyAddress", "settings.net.timeout", "settings.net.sslVerify"] },
  { key: "remote-access", groupKey: "groupNetwork", labelKey: "settings.pageRemoteAccess", render: () => <RemoteAccessNext />, itemKeys: ["settings.remote.enabled", "settings.remote.port", "settings.remote.pairingCode"] },
  { key: "notification", groupKey: "groupSystem", labelKey: "settings.pageNotification", render: () => <NotificationSettingsNext />, itemKeys: ["settings.notif.desktop", "settings.notif.sessionComplete", "settings.notif.costWarning", "settings.notif.versionUpdate"] },
  { key: "data-management", groupKey: "groupSystem", labelKey: "settings.pageDataManagement", render: () => <DataManagementNext />, itemKeys: ["settings.data.directory", "settings.data.export", "settings.data.clearCache", "settings.data.clearAll"] },
  { key: "about", groupKey: "groupAbout", labelKey: "settings.pageAbout", render: () => <AboutNext />, itemKeys: ["settings.about.version", "settings.about.channel"] },
];

const GROUP_ORDER = ["groupGeneral", "groupCli", "groupProviders", "groupNetwork", "groupSystem", "groupAbout"];

/* ============ 搜索 ============ */

interface SearchHit {
  pageKey: string;
  /** 命中的设置项标签键；页名命中时为空 */
  itemKey?: string;
}

interface SettingsPageNextProps {
  /** 初始页（默认通用设置） */
  initialPage?: string;
}

export default function SettingsPageNext({ initialPage = "general" }: SettingsPageNextProps) {
  const { t } = useTranslation();
  const [activePage, setActivePage] = useState(initialPage);
  const [query, setQuery] = useState("");
  const [highlightKey, setHighlightKey] = useState<string | undefined>();
  const highlightTimerRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const uiZoom = useAppStore((s) => s.uiZoom);
  const uiFontFamily = useAppStore((s) => s.uiFontFamily);

  // 界面缩放与字体即时生效（与旧 AppLayout 同逻辑；新壳层正式化后由 shell.css 消费）
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty("--ui-zoom", `${uiZoom / 100}`);
    html.style.setProperty("--ui-font", uiFontFamily === "system-ui" ? "" : uiFontFamily);
  }, [uiZoom, uiFontFamily]);

  // 搜索命中：对当前语言的页名/设置项标签做大小写不敏感包含匹配
  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results: SearchHit[] = [];
    for (const page of PAGES) {
      const pageLabel = t(page.labelKey).toLowerCase();
      if (pageLabel.includes(q)) {
        results.push({ pageKey: page.key });
      }
      for (const itemKey of page.itemKeys ?? []) {
        if (t(itemKey).toLowerCase().includes(q)) {
          results.push({ pageKey: page.key, itemKey });
        }
      }
    }
    return results.slice(0, 12);
  }, [query, t]);

  const activeDef = PAGES.find((p) => p.key === activePage) ?? PAGES[0];
  const groups = useMemo(() => {
    const grouped = new Map<string, SettingsPageDef[]>();
    for (const groupKey of GROUP_ORDER) {
      grouped.set(groupKey, PAGES.filter((p) => p.groupKey === groupKey));
    }
    return grouped;
  }, []);

  const jumpTo = (hit: SearchHit) => {
    setActivePage(hit.pageKey);
    setQuery("");
    if (hit.itemKey) {
      if (highlightTimerRef.current) {
        window.clearTimeout(highlightTimerRef.current);
      }
      setHighlightKey(hit.itemKey);
      // 等页面渲染完成再滚动定位
      requestAnimationFrame(() => {
        document
          .getElementById(hit.itemKey ?? "")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      highlightTimerRef.current = window.setTimeout(() => setHighlightKey(undefined), 1500);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-background">
      {/* 移动端顶栏：Select 切页（<768px，规范 1.4） */}
      <div className="border-b border-border/60 p-3 md:hidden">
        <Select value={activePage} onValueChange={setActivePage}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAGES.map((page) => (
              <SelectItem key={page.key} value={page.key} disabled={page.migrating}>
                {t(page.labelKey)}
                {page.migrating ? ` · ${t("settings.migrating")}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 左侧分类导航（≥768px，200px） */}
        <nav className="hidden w-[200px] flex-shrink-0 flex-col overflow-y-auto border-r border-border/60 px-2 py-3 md:flex">
          {[...groups.entries()].map(([groupKey, pages]) => (
            <div key={groupKey} className="mb-3">
              <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {t(`settings.${groupKey}`)}
              </div>
              <ul>
                {pages.map((page) => (
                  <li key={page.key}>
                    <button
                      type="button"
                      disabled={page.migrating}
                      onClick={() => setActivePage(page.key)}
                      className={cn(
                        "flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[13px] transition-colors",
                        page.key === activePage
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground/80 hover:bg-accent/60",
                        page.migrating && "cursor-not-allowed opacity-45 hover:bg-transparent",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{t(page.labelKey)}</span>
                      {page.migrating && (
                        <Badge variant="outline" className="px-1 py-0 text-[9px]">
                          {t("settings.migrating")}
                        </Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* 右侧内容面板：max-w 640 居中，独立滚动 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 搜索栏（含移动端） */}
          <div className="relative border-b border-border/60 p-3">
            <div className="relative mx-auto w-full max-w-[640px]">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("settings.searchSettings")}
                className="pl-8"
                aria-label={t("settings.searchSettings")}
              />
              {hits.length > 0 && (
                <div className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border border-border bg-popover shadow-md">
                  <ul className="max-h-64 overflow-y-auto py-1">
                    {hits.map((hit) => {
                      const page = PAGES.find((p) => p.key === hit.pageKey);
                      return (
                        <li key={`${hit.pageKey}:${hit.itemKey ?? "page"}`}>
                          <button
                            type="button"
                            onClick={() => jumpTo(hit)}
                            className="flex h-8 w-full items-center gap-2 px-3 text-left text-[13px] transition-colors hover:bg-accent"
                          >
                            <span className="text-foreground/90">
                              {page ? t(page.labelKey) : hit.pageKey}
                            </span>
                            {hit.itemKey && (
                              <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted-foreground/70">
                                {t(hit.itemKey)}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {query.trim() && hits.length === 0 && (
                <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-md">
                  {t("settings.noResults")}
                </div>
              )}
            </div>
          </div>

          {/* 内容面板 */}
          <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
            <div className="mx-auto w-full max-w-[640px]">
              <h2 className="pb-1 text-[15px] font-semibold">{t(activeDef.labelKey)}</h2>
              {activeDef.render?.(highlightKey) ?? (
                <div className="py-10 text-center text-xs text-muted-foreground/60">
                  {t("settings.migrating")}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
