/**
 * 正式应用组装根（新骨架接管，T14/T15 前置）。
 *
 * WindowFrame（fullscreen）+ 简版侧栏树（项目→分类→会话，点击 openTab）
 * + Panes（TabBarNext/PaneViewNext/PaneSplitter，共享 PTY 语义不变）
 * + 全局弹窗组（已迁移 Next 组件）+ 视图切换（会话/设置/费用/帮助）。
 *
 * 启动链与旧 AppLayout 对齐：CLI 检测 → Profile/项目/会话/分类/供应商加载
 * → 布局恢复 → 运行会话 30s 费用轮询。侧栏完整树交互（右键/拖拽/重命名）
 * 随侧栏专项轮完善，本版保核心链路（建项目→建会话→终端→费用→设置）。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderPlus,
  MessageSquarePlus,
  Settings as SettingsIcon,
  PieChart,
  CircleHelp,
} from "lucide-react";
import { detectCliTools, listProfiles, pollCosts } from "@/utils/ipc";
import { useAppStore } from "@/stores/appStore";
import { themeStore, initTheme } from "@/stores/themeStore";
import { shellStore, SIDEBAR_COLLAPSED_WIDTH } from "@/stores/shellStore";
import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import { useOnboarding, AgreementModalNext, OnboardingGuideNext } from "@/components/onboarding/OnboardingFlowNext";
import WindowFrame from "@/components/shell/WindowFrame";
import StatusBarShell from "@/components/shell/StatusBarShell";
import PaneViewNext from "@/components/panes/PaneViewNext";
import PaneSplitter from "@/components/panes/PaneSplitter";
import SettingsPageNext from "@/components/settings/next/SettingsPageNext";
import CostDashboardNext from "@/components/cost/CostDashboardNext";
import HelpModalNext from "@/components/help/HelpModalNext";
import NewProjectModalNext from "@/components/tabs/next/NewProjectModalNext";
import NewCategoryModalNext from "@/components/tabs/next/NewCategoryModalNext";
import NewSessionModalNext from "@/components/tabs/next/NewSessionModalNext";
import EditSessionModalNext from "@/components/tabs/next/EditSessionModalNext";
import SearchPanelNext from "@/components/tabs/next/SearchPanelNext";
import ChatPlaceholder from "@/components/chat/ChatPlaceholder";
import TerminalView from "@/components/terminal/TerminalView";
import FileTransferPanel from "@/components/terminal/FileTransferPanel";
import { cn } from "@/lib/utils";

type MainView = "panes" | "settings" | "cost";

/** 侧栏树行 */
function TreeRow({
  depth,
  active,
  colorDot,
  label,
  onClick,
}: {
  depth: number;
  active?: boolean;
  colorDot?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-foreground/85 hover:bg-accent/60",
      )}
      style={{ paddingLeft: 8 + depth * 12 }}
    >
      {colorDot && <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: colorDot }} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

/** 单 pane 内容：活动会话终端 + 记录/传输浮层（portal 宿主为终端容器） */
function PaneContent({
  tabId,
  enableInput,
  workDir,
  toolType,
}: {
  tabId: string | null;
  enableInput: boolean;
  workDir: string | null;
  toolType: string;
}) {
  const session = useAppStore((s) => s.sessions.find((x) => x.id === tabId));
  const hostRef = useRef<HTMLDivElement | null>(null);

  if (!session) {
    return <ChatPlaceholder />;
  }
  const supported = session.toolType === "ssh" || session.toolType === "terminal";
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <TerminalView tabId={session.id} enableInput={enableInput} />
      {/* xterm 浮层宿主（记录/传输面板以绝对定位挂在终端容器上） */}
      <div ref={hostRef} className="pointer-events-none absolute inset-0">
        {supported && (
          <div className="pointer-events-auto">
            <FileTransferPanel
              tabId={session.id}
              toolType={session.toolType}
              workDir={workDir}
              panelHostRef={hostRef}
            />
          </div>
        )}
      </div>
      <span className="hidden">{toolType}</span>
    </div>
  );
}

export default function AppNext() {
  const { t } = useTranslation();
  const resolved = themeStore((s) => s.resolved);
  const collapsed = shellStore((s) => s.sidebarCollapsed);
  const sidebarWidth = shellStore((s) => s.sidebarWidth);

  const projects = useAppStore((s) => s.projects);
  const categories = useAppStore((s) => s.categories);
  const sessions = useAppStore((s) => s.sessions);
  const panes = useAppStore((s) => s.panes);
  const activePaneId = useAppStore((s) => s.activePaneId);
  const splitRatio = useAppStore((s) => s.splitRatio);
  const setSplitRatio = useAppStore((s) => s.setSplitRatio);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const openTab = useAppStore((s) => s.openTab);
  const activeTabId = useAppStore((s) => s.activeTabId);

  // 全局弹窗开关（store 驱动）
  const newProjectModalOpen = useAppStore((s) => s.newProjectModalOpen);
  const setNewProjectModalOpen = useAppStore((s) => s.setNewProjectModalOpen);
  const newCategoryModalOpen = useAppStore((s) => s.newCategoryModalOpen);
  const setNewCategoryModalOpen = useAppStore((s) => s.setNewCategoryModalOpen);
  const newCategoryProjectId = useAppStore((s) => s.newCategoryProjectId);
  const newSessionModalOpen = useAppStore((s) => s.newSessionModalOpen);
  const setNewSessionModalOpen = useAppStore((s) => s.setNewSessionModalOpen);
  const newSessionProjectId = useAppStore((s) => s.newSessionProjectId);
  const newSessionCategoryId = useAppStore((s) => s.newSessionCategoryId);
  const editSessionModalOpen = useAppStore((s) => s.editSessionModalOpen);
  const setEditSessionModalOpen = useAppStore((s) => s.setEditSessionModalOpen);
  const editingSessionId = useAppStore((s) => s.editingSessionId);
  const helpOpen = useAppStore((s) => s.helpOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);
  const setCliTools = useAppStore((s) => s.setCliTools);
  const setProfiles = useAppStore((s) => s.setProfiles);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const loadSessions = useAppStore((s) => s.loadSessions);
  const loadCategories = useAppStore((s) => s.loadCategories);
  const loadLlmProviders = useAppStore((s) => s.loadLlmProviders);
  const restoreTabs = useAppStore((s) => s.restoreTabs);

  const [view, setView] = useState<MainView>("panes");
  const [expandedProjects, setExpandedProjects] = useState<ReadonlySet<string>>(() => new Set());
  const panesHostRef = useRef<HTMLDivElement | null>(null);
  const onboarding = useOnboarding();

  useKeyboardShortcuts();

  // 主题初始化（幂等）
  useEffect(() => {
    initTheme();
  }, []);

  // 启动加载链（与旧 AppLayout 对齐）
  useEffect(() => {
    detectCliTools().then(setCliTools).catch(() => {});
    listProfiles().then(setProfiles).catch(() => {});
    void (async () => {
      await loadProjects();
      await loadSessions();
      await loadCategories();
      await loadLlmProviders();
      restoreTabs();
    })();
  }, [setCliTools, setProfiles, loadProjects, loadSessions, loadCategories, loadLlmProviders, restoreTabs]);

  // 运行会话 30s 费用轮询
  useEffect(() => {
    const hasRunning = sessions.some((s) => s.isRunning);
    if (!hasRunning) return;
    pollCosts().catch(() => {});
    const timer = window.setInterval(() => {
      pollCosts().catch(() => {});
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [sessions]);

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const openSession = (sessionId: string) => {
    void openTab(sessionId).catch(() => {});
  };

  return (
    <WindowFrame
      title="TeaCoder"
      dark={resolved === "dark"}
      onToggleTheme={() => {
        themeStore.getState().setMode(resolved === "dark" ? "light" : "dark");
      }}
      fullscreen
    >
      <div className="relative flex min-h-0 flex-1">
        {/* 桌面侧栏（真实数据） */}
        <aside
          className="surface-blur hidden flex-shrink-0 flex-col border-r border-border/60 md:flex"
          style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth }}
        >
          {!collapsed && (
            <>
              {/* 顶部动作 */}
              <div className="flex gap-1.5 p-2.5">
                <button
                  type="button"
                  onClick={() => setNewProjectModalOpen(true)}
                  className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-border/60 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <FolderPlus size={12} />
                  {t("sessions.newProject")}
                </button>
                <button
                  type="button"
                  onClick={() => setNewSessionModalOpen(true, projects[0]?.id ?? null, null)}
                  aria-label={t("sessions.newSession")}
                  title={t("sessions.newSession")}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <MessageSquarePlus size={12} />
                </button>
              </div>

              {/* 项目树 */}
              <nav className="flex-1 overflow-y-auto px-2 pb-2">
                {projects.map((project) => {
                  const expanded = expandedProjects.has(project.id);
                  const projectSessions = sessions.filter((s) => s.projectId === project.id);
                  const projectCategories = categories.filter((c) => c.projectId === project.id);
                  return (
                    <div key={project.id} className="mb-1">
                      <TreeRow
                        depth={0}
                        colorDot={project.color}
                        label={project.name}
                        onClick={() => toggleProject(project.id)}
                      />
                      {expanded && (
                        <>
                          {projectCategories.map((cat) => (
                            <div key={cat.id}>
                              <TreeRow depth={1} label={cat.name} onClick={() => toggleProject(project.id)} />
                              {projectSessions
                                .filter((s) => s.categoryId === cat.id)
                                .map((s) => (
                                  <TreeRow
                                    key={s.id}
                                    depth={2}
                                    active={s.id === activeTabId}
                                    colorDot={s.color}
                                    label={s.title || s.toolType}
                                    onClick={() => openSession(s.id)}
                                  />
                                ))}
                            </div>
                          ))}
                          {projectSessions
                            .filter((s) => !s.categoryId)
                            .map((s) => (
                              <TreeRow
                                key={s.id}
                                depth={1}
                                active={s.id === activeTabId}
                                colorDot={s.color}
                                label={s.title || s.toolType}
                                onClick={() => openSession(s.id)}
                              />
                            ))}
                        </>
                      )}
                    </div>
                  );
                })}
                {projects.length === 0 && (
                  <div className="px-2 py-4 text-center text-[11px] text-muted-foreground/60">
                    {t("shell.emptyProjects")}
                  </div>
                )}
              </nav>

              {/* 底部视图入口 */}
              <div className="border-t border-border/60 p-2">
                <div className="flex gap-1">
                  {(
                    [
                      { view: "panes" as MainView, icon: <MessageSquarePlus size={13} />, label: t("shell.viewPanes") },
                      { view: "settings" as MainView, icon: <SettingsIcon size={13} />, label: t("shell.viewSettings") },
                      { view: "cost" as MainView, icon: <PieChart size={13} />, label: t("cost.title") },
                    ]
                  ).map((entry) => (
                    <button
                      key={entry.view}
                      type="button"
                      title={entry.label}
                      aria-label={entry.label}
                      onClick={() => setView(entry.view)}
                      className={cn(
                        "flex h-7 flex-1 items-center justify-center rounded-md transition-colors",
                        view === entry.view
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      {entry.icon}
                    </button>
                  ))}
                  <button
                    type="button"
                    title={t("help.title")}
                    aria-label={t("help.title")}
                    onClick={() => setHelpOpen(true)}
                    className="flex h-7 flex-1 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                  >
                    <CircleHelp size={13} />
                  </button>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* 内容区 */}
        {view === "panes" &&
          (panes.length === 0 ? (
            <ChatPlaceholder />
          ) : (
            <div ref={panesHostRef} className="flex min-h-0 min-w-0 flex-1">
              {panes.map((pane, index) => (
                <div
                  key={pane.id}
                  className="flex min-w-0 flex-col"
                  style={{ flexBasis: index === 0 ? `${splitRatio * 100}%` : `${(1 - splitRatio) * 100}%` }}
                  onPointerDown={() => setActivePane(pane.id)}
                >
                  <div className="flex min-h-0 flex-1 flex-col">
                    <PaneViewNext
                      paneId={pane.id}
                      renderContent={(tabId) => (
                        <PaneContent
                          tabId={tabId}
                          enableInput={pane.id === activePaneId}
                          toolType={sessions.find((s) => s.id === tabId)?.toolType ?? ""}
                          workDir={(() => {
                            const session = sessions.find((s) => s.id === tabId);
                            return projects.find((p) => p.id === session?.projectId)?.path ?? null;
                          })()}
                        />
                      )}
                    />
                  </div>
                  {index === 0 && panes.length >= 2 && (
                    <PaneSplitter
                      ratio={splitRatio}
                      onRatioChange={setSplitRatio}
                      containerRef={panesHostRef}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        {view === "settings" && (
          <div className="min-h-0 min-w-0 flex-1">
            <SettingsPageNext />
          </div>
        )}
        {view === "cost" && (
          <div className="min-h-0 min-w-0 flex-1">
            <CostDashboardNext />
          </div>
        )}
      </div>

      <StatusBarShell runtime="tauri-desktop" />

      {/* 全局弹窗组 */}
      <NewProjectModalNext open={newProjectModalOpen} onClose={() => setNewProjectModalOpen(false)} />
      <NewCategoryModalNext
        open={newCategoryModalOpen}
        projectId={newCategoryProjectId}
        onClose={() => setNewCategoryModalOpen(false)}
      />
      <NewSessionModalNext
        open={newSessionModalOpen}
        projectId={newSessionProjectId}
        categoryId={newSessionCategoryId}
        onClose={() => setNewSessionModalOpen(false)}
      />
      <EditSessionModalNext
        open={editSessionModalOpen}
        sessionId={editingSessionId}
        onClose={() => setEditSessionModalOpen(false)}
      />
      <SearchPanelNext />
      <HelpModalNext open={helpOpen} onClose={() => setHelpOpen(false)} />
      <AgreementModalNext open={onboarding.showAgreement} onAccept={onboarding.completeAgreement} />
      <OnboardingGuideNext
        open={onboarding.showGuide}
        onComplete={onboarding.completeGuide}
        onSkip={onboarding.skipGuide}
      />
    </WindowFrame>
  );
}
