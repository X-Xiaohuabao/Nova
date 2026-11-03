/**
 * 会话搜索面板（新骨架，B5 / T12）。
 *
 * ⌘P 快速切换会话：项目名 / 会话标题 / 工具名匹配，cmdk（Command）实现；
 * 选中项已打开则直接激活，否则 openTab 打开。
 */

import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAppStore } from "@/stores/appStore";
import { TOOL_DISPLAY_NAMES } from "@/types";
import { reportOpenTabError } from "@/utils/openTabError";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export default function SearchPanelNext() {
  const { t } = useTranslation();
  const searchOpen = useAppStore((s) => s.searchOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const sessions = useAppStore((s) => s.sessions);
  const projects = useAppStore((s) => s.projects);
  const openTab = useAppStore((s) => s.openTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const openTabIds = useAppStore((s) => s.openTabIds);

  const getProjectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name || projectId;

  const handleSelect = (tabId: string) => {
    if (openTabIds.includes(tabId)) {
      setActiveTab(tabId);
    } else {
      // MessageLike 契约：toast 的 error/warning 签名兼容
      openTab(tabId).catch((err) => {
        reportOpenTabError(toast, err);
      });
    }
    setSearchOpen(false);
  };

  return (
    <CommandDialog
      open={searchOpen}
      onOpenChange={setSearchOpen}
      title={t("sessions.quickSwitch")}
      description={t("sessions.quickSwitchHint")}
    >
      <CommandInput placeholder={t("sessions.searchPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("sessions.noMatch")}</CommandEmpty>
        <CommandGroup>
          {sessions.map((tab) => (
            <CommandItem
              key={tab.id}
              value={`${tab.title ?? ""} ${TOOL_DISPLAY_NAMES[tab.toolType]} ${getProjectName(tab.projectId)}`}
              onSelect={() => handleSelect(tab.id)}
              className="gap-2"
            >
              <span
                aria-hidden
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: tab.color || "#888" }}
              />
              <span className="min-w-0 flex-1 truncate">
                {tab.title || TOOL_DISPLAY_NAMES[tab.toolType]}
              </span>
              <span className="flex-shrink-0 text-[11px] text-muted-foreground/70">
                {getProjectName(tab.projectId)}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
