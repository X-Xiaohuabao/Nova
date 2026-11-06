/**
 * 导航第一列：项目列表（M1 布局版，替代旧树的项目一级）。
 *
 * 顶部：搜索会话输入 + 新建会话"+"（作用于激活项目，无激活时禁用）。
 * 列表：项目行点击 = 激活项目（会话列表在右侧 SessionColumn 展示，不再树形展开）。
 * 交互沿用旧树：右键菜单（新建分类/新建会话/重命名/项目默认/文件管理器/删除）、
 * 双击 inline 重命名、删除经 ConfirmDialog 确认。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FolderPlus, Plus, Search } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { openPathInFileManager } from "@/utils/ipc";
import ProjectDefaultsDialog from "@/components/tabs/next/ProjectDefaultsDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type RenameTarget = { id: string; name: string } | null;
type DeleteTarget = { id: string; name: string } | null;

interface ProjectColumnProps {
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onNewSession: (projectId: string, categoryId: string | null) => void;
  onNewProject: () => void;
}

export default function ProjectColumn({
  activeProjectId,
  onSelectProject,
  searchQuery,
  onSearchQueryChange,
  onNewSession,
  onNewProject,
}: ProjectColumnProps) {
  const { t } = useTranslation();
  const projects = useAppStore((s) => s.projects);
  const sessions = useAppStore((s) => s.sessions);
  const updateProject = useAppStore((s) => s.updateProject);
  const deleteProject = useAppStore((s) => s.deleteProject);

  const [renaming, setRenaming] = useState<RenameTarget>(null);
  const [renameValue, setRenameValue] = useState("");
  // 项目默认模型配置弹窗（M4）：null = 关闭，否则为项目 id
  const [defaultsProjectId, setDefaultsProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

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
    void updateProject(target.id, { name: next }).catch(() => toast.error(t("sessions.opFailed")));
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    void deleteProject(target.id)
      .then(() => toast.success(t("tree.projectDeleted")))
      .catch(() => toast.error(t("sessions.opFailed")));
  };

  const newSessionDisabled = activeProjectId === null;

  return (
    <aside className="surface-blur flex w-[188px] flex-shrink-0 flex-col border-r border-border/60">
      {/* 顶部：搜索会话 + 新建会话 */}
      <div className="flex items-center gap-1.5 p-2.5">
        <div className="relative min-w-0 flex-1">
          <Search
            size={12}
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-muted-foreground/70"
          />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder={t("nav.searchSessions")}
            aria-label={t("nav.searchSessions")}
            className="h-7 rounded-md pl-7 text-xs"
          />
        </div>
        <button
          type="button"
          disabled={newSessionDisabled}
          onClick={() => activeProjectId && onNewSession(activeProjectId, null)}
          aria-label={t("shell.newSession")}
          title={newSessionDisabled ? t("nav.newSessionNeedsProject") : t("shell.newSession")}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* 项目列表：点击激活，会话在右列展示 */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium tracking-wider text-muted-foreground/70 uppercase">
          {t("tree.projects")}
        </div>
        {projects.map((project) => {
          const active = project.id === activeProjectId;
          const count = sessions.filter((s) => s.projectId === project.id).length;
          return (
            <ContextMenu key={project.id}>
              <ContextMenuTrigger asChild>
                <div
                  className={cn(
                    "flex h-7 w-full cursor-default items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground/85 hover:bg-accent/60",
                  )}
                  onClick={() => onSelectProject(project.id)}
                  onDoubleClick={() => startRename({ id: project.id, name: project.name })}
                >
                  {renaming?.id === project.id ? (
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
                  ) : (
                    <>
                      {project.color && (
                        <span
                          aria-hidden
                          className="h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ background: project.color }}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground/60">{count}</span>
                    </>
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onSelectProject(project.id)}>{t("nav.viewSessions")}</ContextMenuItem>
                <ContextMenuItem onSelect={() => setDefaultsProjectId(project.id)}>
                  {t("sessions.projectDefaults")}
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    void openPathInFileManager(project.path).catch(() => {});
                  }}
                >
                  {t("tree.openInFileManager")}
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => startRename({ id: project.id, name: project.name })}>
                  {t("tree.rename")}
                </ContextMenuItem>
                <ContextMenuItem
                  className="text-destructive"
                  onSelect={() => setDeleteTarget({ id: project.id, name: project.name })}
                >
                  {t("common.delete")}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
        {projects.length === 0 && (
          <div className="px-2 py-4 text-center text-[11px] text-muted-foreground/60">
            {t("shell.emptyProjects")}
          </div>
        )}
      </nav>

      {/* 底部：新建项目 */}
      <div className="border-t border-border/60 p-2">
        <button
          type="button"
          onClick={onNewProject}
          className="flex h-7 w-full items-center justify-center gap-1 rounded-md border border-border/60 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <FolderPlus size={12} />
          {t("sessions.newProject")}
        </button>
      </div>

      {/* 删除确认（全局唯一确认组件） */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title={t("tree.deleteTitle.project", { name: deleteTarget?.name ?? "" })}
        description={t("tree.deleteProjectDesc")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={confirmDelete}
      />
      <ProjectDefaultsDialog
        project={projects.find((p) => p.id === defaultsProjectId) ?? null}
        open={defaultsProjectId !== null}
        onClose={() => setDefaultsProjectId(null)}
      />
    </aside>
  );
}
