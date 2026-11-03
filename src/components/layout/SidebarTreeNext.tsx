/**
 * 侧栏项目树（新骨架，C1/C2，完整交互版）。
 *
 * 项目 → 分类 → 会话三层；收藏会话置顶区。交互：
 * - 行点击：项目/分类折叠切换，会话 openTab
 * - 右键菜单（ContextMenu）：项目（新建分类/新建会话/重命名/在文件管理器打开/删除）、
 *   分类（新建会话/重命名/删除）、会话（编辑/收藏/取消收藏/删除）
 * - 双击重命名（inline，Esc/失焦提交）
 * - 删除均经 AlertDialog 确认；文案走 i18n
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { openPathInFileManager } from "@/utils/ipc";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RenameTarget =
  | { kind: "project"; id: string; name: string }
  | { kind: "category"; id: string; name: string }
  | { kind: "session"; id: string; name: string }
  | null;

type DeleteTarget =
  | { kind: "project"; id: string; name: string }
  | { kind: "category"; id: string; name: string }
  | { kind: "session"; id: string; name: string }
  | null;

interface SidebarTreeNextProps {
  expandedProjects: ReadonlySet<string>;
  onToggleProject: (projectId: string) => void;
  onOpenSession: (sessionId: string) => void;
  onNewCategory: (projectId: string) => void;
  onNewSession: (projectId: string | null, categoryId: string | null) => void;
}

export default function SidebarTreeNext({
  expandedProjects,
  onToggleProject,
  onOpenSession,
  onNewCategory,
  onNewSession,
}: SidebarTreeNextProps) {
  const { t } = useTranslation();
  const projects = useAppStore((s) => s.projects);
  const categories = useAppStore((s) => s.categories);
  const sessions = useAppStore((s) => s.sessions);
  const favoriteTabs = useAppStore((s) => s.favoriteTabs);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const updateProject = useAppStore((s) => s.updateProject);
  const deleteProject = useAppStore((s) => s.deleteProject);
  const updateCategory = useAppStore((s) => s.updateCategory);
  const deleteCategory = useAppStore((s) => s.deleteCategory);
  const deleteSession = useAppStore((s) => s.deleteSession);

  const [renaming, setRenaming] = useState<RenameTarget>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const favoriteSessions = useMemo(
    () => sessions.filter((s) => favoriteTabs.includes(s.id)),
    [sessions, favoriteTabs],
  );

  const startRename = (target: NonNullable<RenameTarget>) => {
    setRenaming(target);
    setRenameValue(target.name);
  };

  const commitRename = () => {
    const target = renaming;
    setRenaming(null);
    if (!target) return;
    const next = renameValue.trim();
    if (!next || next === target.name) return;
    if (target.kind === "project") {
      void updateProject(target.id, { name: next }).catch(() => toast.error(t("sessions.opFailed")));
    } else if (target.kind === "category") {
      void updateCategory(target.id, { name: next }).catch(() => toast.error(t("sessions.opFailed")));
    } else {
      void useAppStore
        .getState()
        .updateSession(target.id, { title: next })
        .catch(() => toast.error(t("sessions.opFailed")));
    }
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    if (target.kind === "project") {
      void deleteProject(target.id).then(() => toast.success(t("tree.projectDeleted"))).catch(() => toast.error(t("sessions.opFailed")));
    } else if (target.kind === "category") {
      void deleteCategory(target.id).then(() => toast.success(t("tree.categoryDeleted"))).catch(() => toast.error(t("sessions.opFailed")));
    } else {
      void deleteSession(target.id).then(() => toast.success(t("tree.sessionDeleted"))).catch(() => toast.error(t("sessions.opFailed")));
    }
  };

  /** inline 重命名输入（Enter 提交 / Esc 取消） */
  const renameInput = () => (
    <Input
      autoFocus
      className="h-5 px-1 text-xs"
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      onBlur={commitRename}
      onKeyDown={(e) => {
        if (e.key === "Enter") commitRename();
        if (e.key === "Escape") setRenaming(null);
      }}
      aria-label={t("tree.rename")}
      onClick={(e) => e.stopPropagation()}
    />
  );

  const rowClass = (active: boolean) =>
    cn(
      "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors",
      active ? "bg-accent text-accent-foreground" : "text-foreground/85 hover:bg-accent/60",
    );

  const renderSessionRow = (session: { id: string; title: string | undefined; toolType: keyof typeof TOOL_LABELS; color?: string | null }, depth: number) => (
    <ContextMenu key={session.id}>
      <ContextMenuTrigger asChild>
        <div
          className={rowClass(session.id === activeTabId)}
          style={{ paddingLeft: 8 + depth * 12 }}
          onClick={() => onOpenSession(session.id)}
          onDoubleClick={() => startRename({ kind: "session", id: session.id, name: session.title ?? "" })}
        >
          {renaming?.kind === "session" && renaming.id === session.id ? (
            renameInput()
          ) : (
            <>
              {session.color && (
                <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: session.color }} />
              )}
              <span className="min-w-0 flex-1 truncate">
                {session.title || TOOL_LABELS[session.toolType]}
              </span>
              {favoriteTabs.includes(session.id) && <Star size={11} className="flex-shrink-0 text-warning" />}
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpenSession(session.id)}>{t("tree.open")}</ContextMenuItem>
        <ContextMenuItem onSelect={() => setEditSession(session.id)}>{t("sessions.editSession")}</ContextMenuItem>
        <ContextMenuItem onSelect={() => toggleFavorite(session.id)}>
          {favoriteTabs.includes(session.id) ? t("tree.unfavorite") : t("tree.favorite")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => startRename({ kind: "session", id: session.id, name: session.title ?? "" })}>
          {t("tree.rename")}
        </ContextMenuItem>
        <ContextMenuItem className="text-destructive" onSelect={() => setDeleteTarget({ kind: "session", id: session.id, name: session.title ?? "" })}>
          {t("common.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  const setEditSession = (sessionId: string) => {
    useAppStore.getState().setEditSessionModalOpen(true, sessionId);
  };

  return (
    <>
      {/* 收藏区 */}
      {favoriteSessions.length > 0 && (
        <div className="mb-2">
          <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            <Star size={10} className="mr-0.5 inline-block" />
            {t("tree.favorites")}
          </div>
          {favoriteSessions.map((s) =>
            renderSessionRow({ id: s.id, title: s.title, toolType: s.toolType, color: s.color }, 0),
          )}
        </div>
      )}

      {/* 项目树 */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {t("tree.projects")}
        </div>
        {projects.map((project) => {
          const expanded = expandedProjects.has(project.id);
          const projectSessions = sessions.filter((s) => s.projectId === project.id);
          const projectCategories = categories.filter((c) => c.projectId === project.id);
          return (
            <div key={project.id} className="mb-1">
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <div
                    className={rowClass(false)}
                    onClick={() => onToggleProject(project.id)}
                    onDoubleClick={() => startRename({ kind: "project", id: project.id, name: project.name })}
                  >
                    {renaming?.kind === "project" && renaming.id === project.id ? (
                      renameInput()
                    ) : (
                      <>
                        {project.color && (
                          <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: project.color }} />
                        )}
                        <span className="min-w-0 flex-1 truncate">{project.name}</span>
                        <span className="text-[10px] text-muted-foreground/60">{expanded ? "▾" : "▸"}</span>
                      </>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => onNewCategory(project.id)}>{t("tree.newCategory")}</ContextMenuItem>
                  <ContextMenuItem onSelect={() => onNewSession(project.id, null)}>{t("tree.newSession")}</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onSelect={() => startRename({ kind: "project", id: project.id, name: project.name })}>
                    {t("tree.rename")}
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      void openPathInFileManager(project.path).catch(() => {});
                    }}
                  >
                    {t("tree.openInFileManager")}
                  </ContextMenuItem>
                  <ContextMenuItem className="text-destructive" onSelect={() => setDeleteTarget({ kind: "project", id: project.id, name: project.name })}>
                    {t("common.delete")}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>

              {expanded && (
                <>
                  {projectCategories.map((cat) => (
                    <ContextMenu key={cat.id}>
                      <ContextMenuTrigger asChild>
                        <div
                          className={rowClass(false)}
                          style={{ paddingLeft: 8 + 12 }}
                          onClick={() => onToggleProject(project.id)}
                          onDoubleClick={() => startRename({ kind: "category", id: cat.id, name: cat.name })}
                        >
                          {renaming?.kind === "category" && renaming.id === cat.id ? (
                            renameInput()
                          ) : (
                            <span className="min-w-0 flex-1 truncate">{cat.name}</span>
                          )}
                        </div>
                      </ContextMenuTrigger>
                      <ContextMenuContent>
                        <ContextMenuItem onSelect={() => onNewSession(project.id, cat.id)}>{t("tree.newSession")}</ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={() => startRename({ kind: "category", id: cat.id, name: cat.name })}>
                          {t("tree.rename")}
                        </ContextMenuItem>
                        <ContextMenuItem className="text-destructive" onSelect={() => setDeleteTarget({ kind: "category", id: cat.id, name: cat.name })}>
                          {t("common.delete")}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  ))}
                  {projectSessions
                    .filter((s) => !s.categoryId)
                    .map((s) =>
                      renderSessionRow({ id: s.id, title: s.title, toolType: s.toolType, color: s.color }, 1),
                    )}
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

      {/* 删除确认 */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t(`tree.deleteTitle.${deleteTarget?.kind ?? "session"}`, { name: deleteTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.kind === "session"
                ? t("tree.deleteSessionDesc")
                : deleteTarget?.kind === "category"
                  ? t("tree.deleteCategoryDesc")
                  : t("tree.deleteProjectDesc")}
            </AlertDialogDescription>
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
    </>
  );
}

const TOOL_LABELS: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  opencode: "OpenCode",
  antigravity: "Antigravity",
  terminal: "Terminal",
  ssh: "SSH",
};
