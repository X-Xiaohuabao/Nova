/**
 * 聊天输入框的斜杠命令面板（design doc §10 V3 项）。
 *
 * draft 以 `/` 开头时在输入区上方弹出：命令段前缀过滤、上下键选择、
 * Enter/Tab 执行、Esc 关闭。键盘事件由 ChatInput 统一转发（焦点保持在
 * 输入框，不落入面板）——本组件是受控展示 + 高亮索引由父层驱动。
 */

import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SlashCommand, SlashCommandSource } from "@/types";
import { cn } from "@/lib/utils";

interface SlashCommandPanelProps {
  /** 全量命令（ChatView 按会话工作目录加载） */
  commands: SlashCommand[];
  /** 命令段过滤词（draft 去掉 `/` 后第一个空格前的部分） */
  filter: string;
  /** 当前高亮索引（键盘导航由父层持有，保证单一事实源） */
  activeIndex: number;
  onExecute: (cmd: SlashCommand, args: string) => void;
  /** 用户参数（`/命令 参数` 的参数段；选中项预览拼装由本组件负责） */
  args: string;
}

/** 来源 → 分组标题（面板按此顺序分组展示） */
const SOURCE_ORDER: SlashCommandSource[] = ["builtin_nova", "builtin_prompt", "project", "user", "skill"];

export default function SlashCommandPanel({
  commands,
  filter,
  activeIndex,
  onExecute,
  args,
}: SlashCommandPanelProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement | null>(null);

  /** 过滤 + 按来源分组（保持来源内原有顺序；matched 与父层高亮索引同源） */
  const { matched, groups } = useMemo(() => {
    const matched = commands.filter((c) => c.name.startsWith(filter));
    const groups = SOURCE_ORDER.map((source) => ({
      source,
      items: matched.filter((c) => c.source === source),
    })).filter((g) => g.items.length > 0);
    return { matched, groups };
  }, [commands, filter]);

  /** 高亮项变化时滚动入视野（长列表键盘导航不脱靶） */
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-active="true"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (groups.length === 0) return null;

  const sourceLabel: Record<SlashCommandSource, string> = {
    builtin_nova: t("chat.cmdGroupBuiltin"),
    builtin_prompt: t("chat.cmdGroupBuiltin"),
    project: t("chat.cmdGroupProject"),
    user: t("chat.cmdGroupUser"),
    skill: t("chat.cmdGroupSkill"),
  };

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md"
      role="listbox"
      aria-label={t("chat.cmdPanelLabel")}
    >
      {groups.map((group) => (
        <div key={group.source}>
          <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium text-muted-foreground/70">
            {sourceLabel[group.source]}
          </div>
          {group.items.map((cmd) => {
            const active = matched[activeIndex] === cmd;
            return (
              <button
                key={`${cmd.source}:${cmd.name}`}
                type="button"
                role="option"
                aria-selected={active}
                data-active={active}
                onClick={() => onExecute(cmd, args)}
                className={cn(
                  "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                  active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                )}
              >
                <span className="font-mono text-[13px] text-foreground">/{cmd.name}</span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  {cmd.description ?? "—"}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
