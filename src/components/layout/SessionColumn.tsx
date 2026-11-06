/**
 * 导航第二列：激活项目的会话列表（M1 布局版，微信式平铺条目）。
 *
 * 激活项目后于项目列表右侧展示；分类降级为分组小标题（不折叠、不嵌套），
 * 本项目收藏会话置顶分组；未分类会话直接平铺。搜索框（项目列）过滤会话名。
 * 交互沿用旧树：右键菜单（会话：打开/编辑/收藏/重命名/删除；分类：新建会话/重命名/删除）、
 * 双击 inline 重命名、删除经 ConfirmDialog 确认。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FolderTree, Star } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import type { Project, Session, SessionCategory } from "@/types";
import { TOOL_DISPLAY_NAMES } from "@/types";
import { toolVisual } from "@/components/tabs/tabVisuals";
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

type RenameTarget =
  | { kind: "category"; id: string; name: string }
  | { kind: "session"; id: string; name: string }
  | null;
type DeleteTarget =
  | { kind: "category"; id: string; name: string }
  | { kind: "session"; id: string; name: string }
  | null;

interface SessionColumnProps {
  project: Project | null;
  searchQuery: string;
  onOpenSession: (sessionId: string) => void;
  onNewSession: (projectId: string, categoryId: string | null) => void;
  onNewCategory: (projectId: string) => void;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 会话时间戳：当天显示时分，同年显示月/日，跨年补年份 */
function formatSessionTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  const monthDay = `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  return d.getFullYear() === now.getFullYear() ? monthDay : `${String(d.getFullYear()).slice(2)}/${monthDay}`;
}

export default function SessionColumn({
  project,
  searchQuery,
  onOpenSession,
  onNewSession,
  onNewCategory,
}: SessionColumnProps) {
  const { t } = useTranslation();
  const categories = useAppStore((s) => s.categories);
  const sessions = useAppStore((s) => s.sessions);
  const favoriteTabs = useAppStore((s) => s.favoriteTabs);
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const updateCategory = useAppStore((s) => s.updateCategory);
  const deleteCategory = useAppStore((s) => s.deleteCategory);
  const deleteSession = useAppStore((s) => s.deleteSession);

  const [renaming, setRenaming] = useState<RenameTarget>(null);
  const [renameValue, setRenameValue] = useState("");
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
    if (target.kind === "category") {
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
    if (target.kind === "category") {
      void deleteCategory(target.id)
        .then(() => toast.success(t("tree.categoryDeleted")))
        .catch(() => toast.error(t("sessions.opFailed")));
    } else {
      void deleteSession(target.id)
        .then(() => toast.success(t("tree.sessionDeleted")))
        .catch(() => toast.error(t("sessions.opFailed")));
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

  /** 微信式两行会话条目：首行图标+标题+时间，次行工具/模型摘要 */
  const renderSessionItem = (session: Session) => {
    const visual = toolVisual(session.toolType as Parameters<typeof toolVisual>[0]);
    const running = session.isRunning;
    return (
      <ContextMenu key={session.id}>
        <ContextMenuTrigger asChild>
          <div
            className={cn(
              "flex w-full cursor-default items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
              session.id === activeTabId ? "bg-accent" : "hover:bg-accent/60",
            )}
            onClick={() => onOpenSession(session.id)}
            onDoubleClick={() => startRename({ kind: "session", id: session.id, name: session.title ?? "" })}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md",
                session.id === activeTabId ? "bg-background/70" : "bg-accent/50",
              )}
              style={{ color: visual.color }}
            >
              <visual.Icon size={14} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-foreground/90">
                  {session.title || TOOL_DISPLAY_NAMES[session.toolType] || session.toolType}
                </span>
                <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
                  {formatSessionTime(session.updatedAt)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {running && (
                  <span aria-hidden className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-500" />
                )}
                <span className="min-w-0 flex-1 truncate text-[11px] leading-4 text-muted-foreground/70">
                  {session.modelName
                    ? `${TOOL_DISPLAY_NAMES[session.toolType] ?? session.toolType} · ${session.modelName}`
                    : (TOOL_DISPLAY_NAMES[session.toolType] ?? session.toolType)}
                </span>
                {favoriteTabs.includes(session.id) && (
                  <Star size={10} className="flex-shrink-0 text-warning" />
                )}
              </div>
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => onOpenSession(session.id)}>{t("tree.open")}</ContextMenuItem>
          <ContextMenuItem
            onSelect={() => useAppStore.getState().setEditSessionModalOpen(true, session.id)}
          >
            {t("sessions.editSession")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => toggleFavorite(session.id)}>
            {favoriteTabs.includes(session.id) ? t("tree.unfavorite") : t("tree.favorite")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => startRename({ kind: "session", id: session.id, name: session.title ?? "" })}>
            {t("tree.rename")}
          </ContextMenuItem>
          <ContextMenuItem
            className="text-destructive"
            onSelect={() => setDeleteTarget({ kind: "session", id: session.id, name: session.title ?? "" })}
          >
            {t("common.delete")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  /** 分类分组小标题（可右键管理分类） */
  const renderCategoryHeader = (category: SessionCategory, count: number) => (
    <ContextMenu key={category.id}>
      <ContextMenuTrigger asChild>
        <div className="flex h-6 w-full cursor-default items-center gap-1.5 rounded-md px-2 text-left">
          {renaming?.kind === "category" && renaming.id === category.id ? (
            renameInput()
          ) : (
            <>
              {category.color && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: category.color }}
                />
              )}
              <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide text-muted-foreground/80">
                {category.name}
              </span>
              <span className="text-[10px] tabular-nums text-muted-foreground/50">{count}</span>
            </>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onNewSession(category.projectId, category.id)}>
          {t("tree.newSession")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => startRename({ kind: "category", id: category.id, name: category.name })}>
          {t("tree.rename")}
        </ContextMenuItem>
        <ContextMenuItem
          className="text-destructive"
          onSelect={() => setDeleteTarget({ kind: "category", id: category.id, name: category.name })}
        >
          {t("common.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  // —— 数据视图：空态 / 过滤 / 分组 ——

  if (!project) {
    return (
      <aside className="surface-blur flex w-[260px] flex-shrink-0 flex-col border-r border-border/60">
        <EmptyHint text={t("nav.selectProject")} />
      </aside>
    );
  }

  const query = searchQuery.trim().toLowerCase();
  const projectSessions = sessions.filter(
    (s) =>
      s.projectId === project.id &&
      (!query || (s.title ?? "").toLowerCase().includes(query) || s.toolType.toLowerCase().includes(query)),
  );
  const projectCategories = categories
    .filter((c) => c.projectId === project.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const favorites = projectSessions.filter((s) => favoriteTabs.includes(s.id));
  const uncategorized = projectSessions.filter(
    (s) => !s.categoryId && !favoriteTabs.includes(s.id),
  );

  return (
    <aside className="surface-blur flex w-[260px] flex-shrink-0 flex-col border-r border-border/60">
      {/* 顶部：项目名 + 新建分类入口 */}
      <div className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-border/60 px-3">
        {project.color && (
          <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: project.color }} />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground/90">{project.name}</span>
        <button
          type="button"
          onClick={() => onNewCategory(project.id)}
          aria-label={t("tree.newCategory")}
          title={t("tree.newCategory")}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <FolderTree size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5">
        {projectSessions.length === 0 ? (
          query ? (
            <EmptyHint text={t("nav.noSearchResult")} />
          ) : (
            <EmptyHint text={t("nav.noSessions")} />
          )
        ) : (
          <>
            {favorites.length > 0 && (
              <div className="mb-1.5">
                <div className="flex h-6 items-center gap-1.5 px-2">
                  <Star size={10} className="text-warning" />
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground/80">
                    {t("tree.favorites")}
                  </span>
                </div>
                {favorites.map(renderSessionItem)}
              </div>
            )}
            {projectCategories.map((category) => {
              const grouped = projectSessions.filter(
                (s) => s.categoryId === category.id && !favoriteTabs.includes(s.id),
              );
              if (grouped.length === 0) return null;
              return (
                <div key={category.id} className="mb-1.5">
                  {renderCategoryHeader(category, grouped.length)}
                  {grouped.map(renderSessionItem)}
                </div>
              );
            })}
            {uncategorized.length > 0 && uncategorized.map(renderSessionItem)}
          </>
        )}
      </div>

      {/* 删除确认（全局唯一确认组件） */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        title={t(`tree.deleteTitle.${deleteTarget?.kind ?? "session"}`, { name: deleteTarget?.name ?? "" })}
        description={
          deleteTarget?.kind === "category" ? t("tree.deleteCategoryDesc") : t("tree.deleteSessionDesc")
        }
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={confirmDelete}
      />
    </aside>
  );
}

/** 列表空态提示 */
function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center px-4 text-center text-[11px] leading-5 text-muted-foreground/60">
      {text}
    </div>
  );
}
