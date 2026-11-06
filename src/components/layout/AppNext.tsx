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
import { matchPath, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { detectCliTools, getSessionCost, listProfiles, pollCosts } from "@/utils/ipc";
import { listen } from "@tauri-apps/api/event";
import { TOOL_DISPLAY_NAMES } from "@/types";
import type { SessionCost } from "@/types";
import { useAppStore } from "@/stores/appStore";
import { toast } from "sonner";
import { reportOpenTabError } from "@/utils/openTabError";
import { themeStore, initTheme } from "@/stores/themeStore";
import { shellStore } from "@/stores/shellStore";
import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import { useOnboarding, AgreementModalNext, OnboardingGuideNext } from "@/components/onboarding/OnboardingFlowNext";
import IconRail from "@/components/layout/IconRail";
import ProjectColumn from "@/components/layout/ProjectColumn";
import SessionColumn from "@/components/layout/SessionColumn";
import { RAIL_WIDTH } from "@/components/layout/views";
import WindowFrame from "@/components/shell/WindowFrame";
import StatusBarShell from "@/components/shell/StatusBarShell";
import { toolVisual } from "@/components/tabs/tabVisuals";
import PaneViewNext from "@/components/panes/PaneViewNext";
import PaneSplitter from "@/components/panes/PaneSplitter";
import SettingsPageNext from "@/components/settings/next/SettingsPageNext";
import CostDashboardNext from "@/components/cost/CostDashboardNext";
import HelpPageNext from "@/components/help/HelpPageNext";
import NewProjectModalNext from "@/components/tabs/next/NewProjectModalNext";
import NewCategoryModalNext from "@/components/tabs/next/NewCategoryModalNext";
import NewSessionModalNext from "@/components/tabs/next/NewSessionModalNext";
import SessionModelSwitcher from "@/components/tabs/next/SessionModelSwitcher";
import { MODEL_SWITCHABLE_TOOLS } from "@/utils/sessionModel";
import EditSessionModalNext from "@/components/tabs/next/EditSessionModalNext";
import SearchPanelNext from "@/components/tabs/next/SearchPanelNext";
import ChatPlaceholder from "@/components/chat/ChatPlaceholder";
import ChatView from "@/components/chat/ChatView";
import TerminalView from "@/components/terminal/TerminalView";
import FileTransferPanel from "@/components/terminal/FileTransferPanel";
import { effectiveViewMode } from "@/stores/appStore";
import { MessageSquare, SquareTerminal } from "lucide-react";
import { cn } from "@/lib/utils";

/** 单 pane 内容：按视图形态分流——聊天（agent 通道）/ 终端（PTY 通道），claude 会话右上角可切换 */
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
  const { t } = useTranslation();
  const session = useAppStore((s) => s.sessions.find((x) => x.id === tabId));
  const viewMode = useAppStore((s) =>
    s.sessions.find((x) => x.id === tabId)
      ? effectiveViewMode(s.sessions.find((x) => x.id === tabId)!, s.sessionViewModes)
      : "terminal",
  );
  const setSessionViewMode = useAppStore((s) => s.setSessionViewMode);
  const hostRef = useRef<HTMLDivElement | null>(null);

  if (!session) {
    return <ChatPlaceholder />;
  }

  // claude 会话的视图切换控件（design doc §1：右上角图标切换，非全局设置）
  const viewToggle =
    session.toolType === "claude" ? (
      <button
        type="button"
        onClick={() => {
          void setSessionViewMode(session.id, viewMode === "chat" ? "terminal" : "chat");
        }}
        aria-label={viewMode === "chat" ? t("chat.switchToTerminal") : t("chat.switchToChat")}
        title={viewMode === "chat" ? t("chat.switchToTerminal") : t("chat.switchToChat")}
        className="absolute top-2 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
      >
        {viewMode === "chat" ? (
          <SquareTerminal size={14} strokeWidth={2} />
        ) : (
          <MessageSquare size={14} strokeWidth={2} />
        )}
      </button>
    ) : null;

  // 聊天视图：agent 子进程通道（claude 专属）
  if (session.toolType === "claude" && viewMode === "chat") {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ChatView sessionId={session.id} toolType="claude" />
        {viewToggle}
        <span className="hidden">{toolType}</span>
      </div>
    );
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
      {viewToggle}
      <span className="hidden">{toolType}</span>
    </div>
  );
}

export default function AppNext() {
  const { t } = useTranslation();
  const resolved = themeStore((s) => s.resolved);
  const collapsed = shellStore((s) => s.sidebarCollapsed);

  const projects = useAppStore((s) => s.projects);
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
  const setCliTools = useAppStore((s) => s.setCliTools);
  const setProfiles = useAppStore((s) => s.setProfiles);
  const loadProjects = useAppStore((s) => s.loadProjects);
  const loadSessions = useAppStore((s) => s.loadSessions);
  const loadCategories = useAppStore((s) => s.loadCategories);
  const loadLlmProviders = useAppStore((s) => s.loadLlmProviders);
  const restoreTabs = useAppStore((s) => s.restoreTabs);

  // 视图与激活项目由路由驱动（M2）：/panes/:projectId
  const location = useLocation();
  const navigate = useNavigate();
  const isPanesRoute = location.pathname === "/panes" || location.pathname.startsWith("/panes/");
  const routeProjectId = matchPath("/panes/:projectId", location.pathname)?.params.projectId ?? null;
  const [searchQuery, setSearchQuery] = useState("");

  // 已访问视图集合：首访挂载后常驻（保活）。设置/统计/帮助整树挂载实测
  // 有 200~800ms 主线程阻塞，每次切换重挂是卡顿根因；保活后切换仅翻转可见性
  const routeView = location.pathname.split("/")[1] ?? "panes";
  const [mountedViews, setMountedViews] = useState<ReadonlySet<string>>(() => new Set(["panes"]));
  useEffect(() => {
    setMountedViews((prev) => (prev.has(routeView) ? prev : new Set(prev).add(routeView)));
  }, [routeView]);
  const panesHostRef = useRef<HTMLDivElement | null>(null);
  const onboarding = useOnboarding();

  // 状态栏会话信息：活动会话的凭据/模型概览 + Token 费用（cost:updated 触发拉取）
  const profilesAll = useAppStore((s) => s.profiles);
  const llmProvidersAll = useAppStore((s) => s.llmProviders);
  const activeSession = sessions.find((s) => s.id === activeTabId);
  const [activeCost, setActiveCost] = useState<SessionCost | null>(null);

  useEffect(() => {
    if (!activeSession) {
      setActiveCost(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      getSessionCost(activeSession.id)
        .then((cost) => {
          if (!cancelled) setActiveCost(cost);
        })
        .catch(() => {});
    };
    load();
    const unlisten = listen<{ scanned: number }>("cost:updated", () => load());
    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [activeSession]);

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

  // 激活项目路由化：无参数时落第一个项目；参数失效（项目被删）时回落，
  // 项目尚未加载完成（启动链异步）时不动作，加载后本 effect 重跑补齐
  useEffect(() => {
    if (!isPanesRoute) return;
    if (routeProjectId && projects.some((p) => p.id === routeProjectId)) return;
    const fallback = projects[0]?.id;
    if (fallback) {
      navigate(`/panes/${fallback}`, { replace: true });
    } else if (routeProjectId) {
      navigate("/panes", { replace: true });
    }
  }, [isPanesRoute, routeProjectId, projects, navigate]);

  const openSession = (sessionId: string) => {
    // 失败原因可见化（如窗口数超限）；未知错误静默由业务上下文负责
    openTab(sessionId).catch((err) => {
      reportOpenTabError(toast, err);
    });
  };

  const statusbar = (
    <StatusBarShell
      runtime="tauri-desktop"
      leftText={
        activeSession ? (
          <span className="flex items-center gap-1.5">
            <ActiveSessionBadge
              toolType={activeSession.toolType}
              profileName={
                activeSession.profileId
                  ? profilesAll.find((p) => p.id === activeSession.profileId)?.name
                  : undefined
              }
              providerName={
                activeSession.llmProviderId
                  ? llmProvidersAll.find((p) => p.id === activeSession.llmProviderId)?.name
                  : undefined
              }
              modelName={activeSession.modelName}
              costUsd={activeCost?.costUsd}
            />
            {MODEL_SWITCHABLE_TOOLS.includes(activeSession.toolType) && (
              <SessionModelSwitcher session={activeSession} />
            )}
          </span>
        ) : (
          t("shell.ready")
        )
      }
    />
  );

  return (
    <WindowFrame
      title="Nova"
      dark={resolved === "dark"}
      onToggleTheme={() => {
        themeStore.getState().setMode(resolved === "dark" ? "light" : "dark");
      }}
      fullscreen
      showDefaultSidebar={false}
      onToggleSidebar={() => shellStore.getState().setSidebarCollapsed(!collapsed)}
      footer={statusbar}
    >
      <div className="relative flex min-h-0 flex-1">
        <IconRail />
        {/* 消息视图（/panes）：常驻保活——切视图仅翻转可见性，xterm 实例与
            PTY 事件流不因路由切换销毁（修复切视图丢终端输出与重建卡顿） */}
        <div
          aria-hidden={!isPanesRoute}
          className={cn(
            "absolute inset-y-0 right-0 flex min-h-0",
            isPanesRoute ? "visible" : "invisible pointer-events-none",
          )}
          style={{ left: RAIL_WIDTH }}
        >
          {/* 导航两列：项目列表 → 激活项目的会话列表；折叠（titlebar 按钮）时隐藏 */}
          {!collapsed && (
            <>
              <ProjectColumn
                activeProjectId={routeProjectId}
                onSelectProject={(projectId) => navigate(`/panes/${projectId}`)}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                onNewSession={(projectId, categoryId) => setNewSessionModalOpen(true, projectId, categoryId)}
                onNewProject={() => setNewProjectModalOpen(true)}
              />
              <SessionColumn
                project={projects.find((p) => p.id === routeProjectId) ?? null}
                searchQuery={searchQuery}
                onOpenSession={openSession}
                onNewSession={(projectId, categoryId) => setNewSessionModalOpen(true, projectId, categoryId)}
                onNewCategory={(projectId) => setNewCategoryModalOpen(true, projectId)}
              />
            </>
          )}

          {/* 内容区：空 tab 的 pane 不参与渲染（残留空分屏自动塌缩）；
              单 pane 时无视残留 splitRatio 占满全宽 */}
          {(() => {
            const visiblePanes = panes.filter((p) => p.openTabIds.length > 0);
            if (visiblePanes.length === 0) {
              return <ChatPlaceholder />;
            }
            const split = visiblePanes.length >= 2;
            return (
              <div ref={split ? panesHostRef : undefined} className="flex min-h-0 min-w-0 flex-1">
                {visiblePanes.map((pane, index) => (
                  <div
                    key={pane.id}
                    className="flex min-w-0 flex-col"
                    style={{
                      flexBasis: !split
                        ? "100%"
                        : index === 0
                          ? `${splitRatio * 100}%`
                          : `${(1 - splitRatio) * 100}%`,
                    }}
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
                  {split && index === 0 && (
                    <PaneSplitter
                      ratio={splitRatio}
                      onRatioChange={setSplitRatio}
                      containerRef={panesHostRef}
                    />
                  )}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* 设置/统计/帮助：首访挂载后保活（与消息视图同策略），路由仅翻转可见性。
            首挂的整树成本只付一次，此后切换是纯 CSS 可见性翻转 */}
        {(["settings", "cost", "help"] as const).map((view) => {
          if (!mountedViews.has(view)) return null;
          const active = routeView === view;
          return (
            <div
              key={view}
              aria-hidden={!active}
              className={cn(
                "absolute inset-y-0 right-0 flex min-h-0 min-w-0",
                active ? "visible" : "invisible pointer-events-none",
              )}
              style={{ left: RAIL_WIDTH }}
            >
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
              {view === "help" && (
                <div className="min-h-0 min-w-0 flex-1">
                  <HelpPageNext />
                </div>
              )}
            </div>
          );
        })}

        {/* 路由占位与兜底：具体路径渲染空（内容由上方保活块负责），未知路径回消息视图 */}
        <Routes>
          <Route path="/" element={<Navigate to="/panes" replace />} />
          <Route path="/panes" element={null} />
          <Route path="/panes/:projectId" element={null} />
          <Route path="/settings" element={null} />
          <Route path="/cost" element={null} />
          <Route path="/help" element={null} />
          <Route path="*" element={<Navigate to="/panes" replace />} />
        </Routes>
      </div>


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
      <AgreementModalNext open={onboarding.showAgreement} onAccept={onboarding.completeAgreement} />
      <OnboardingGuideNext
        open={onboarding.showGuide}
        onComplete={onboarding.completeGuide}
        onSkip={onboarding.skipGuide}
      />
    </WindowFrame>
  );
}

/** 状态栏活动会话徽标：工具图标/名称 + Profile + 供应商·模型 + 估算费用 */
function ActiveSessionBadge({
  toolType,
  profileName,
  providerName,
  modelName,
  costUsd,
}: {
  toolType: string;
  profileName?: string;
  providerName?: string;
  modelName?: string | null;
  costUsd?: number;
}) {
  const visual = toolVisual(toolType as Parameters<typeof toolVisual>[0]);
  const parts = [
    profileName,
    providerName && modelName ? `${providerName} · ${modelName}` : (providerName ?? modelName ?? undefined),
  ].filter(Boolean);
  return (
    <>
      <span aria-hidden style={{ color: visual.color }}>
        <visual.Icon size={12} />
      </span>
      <span className="font-medium text-foreground/80">{TOOL_DISPLAY_NAMES[toolType as keyof typeof TOOL_DISPLAY_NAMES] ?? toolType}</span>
      {parts.length > 0 && <span className="text-muted-foreground/70">{parts.join(" · ")}</span>}
      {typeof costUsd === "number" && costUsd > 0 && (
        <span className="tabular-nums text-muted-foreground/70">${costUsd.toFixed(4)}</span>
      )}
    </>
  );
}
