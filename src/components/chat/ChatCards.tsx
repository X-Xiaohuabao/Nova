/**
 * 待答交互卡（T5）：权限确认卡 + 问题选择卡，渲染在消息流与输入区之间。
 * 应答后由 store 固化记录进消息流，卡片消失（waiting_input 解除）。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleHelp, ShieldAlert } from "lucide-react";
import type { PermissionRequestView, QuestionRequestView } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** 工具参数的一行式摘要：优先展示危险参数（command/file_path 等），限长 */
function summarizeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  for (const key of ["command", "file_path", "path", "pattern", "url", "description"]) {
    const v = record[key];
    if (typeof v === "string" && v) {
      return v.length > 120 ? `${v.slice(0, 120)}…` : v;
    }
  }
  const first = Object.values(record).find((v) => typeof v === "string" && v);
  if (typeof first === "string") {
    return first.length > 120 ? `${first.slice(0, 120)}…` : first;
  }
  return "";
}

export function PermissionCard({
  view,
  onAnswer,
}: {
  view: PermissionRequestView;
  onAnswer: (allow: boolean) => void;
}) {
  const { t } = useTranslation();
  const summary = summarizeInput(view.input);

  return (
    <div className="w-full rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <ShieldAlert size={16} strokeWidth={2} className="shrink-0 text-primary" />
        <span className="text-[13px] font-medium text-foreground">
          {t("chat.permissionTitle")}
        </span>
        <code className="ml-auto rounded bg-secondary/70 px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
          {view.toolName}
        </code>
      </div>
      {summary && (
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary/50 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
          {summary}
        </pre>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => onAnswer(false)}>
          {t("chat.permissionDeny")}
        </Button>
        <Button size="sm" onClick={() => onAnswer(true)}>
          {t("chat.permissionAllow")}
        </Button>
      </div>
    </div>
  );
}

export function QuestionCard({
  view,
  onAnswer,
}: {
  view: QuestionRequestView;
  onAnswer: (text: string) => void;
}) {
  const { t } = useTranslation();
  /** 每题选中项（单选；multiSelect 场景按单选处理，MVP 约束） */
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [freeText, setFreeText] = useState("");

  const submit = () => {
    const lines: string[] = [];
    view.questions.forEach((q, i) => {
      const answer = picked[i];
      if (answer) {
        lines.push(q.header ? `${q.header}: ${answer}` : answer);
      }
    });
    if (freeText.trim()) lines.push(freeText.trim());
    if (lines.length === 0) return;
    onAnswer(lines.join("\n"));
  };

  const canSubmit = Object.keys(picked).length > 0 || freeText.trim().length > 0;

  return (
    <div className="w-full rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <CircleHelp size={16} strokeWidth={2} className="shrink-0 text-primary" />
        <span className="text-[13px] font-medium text-foreground">
          {t("chat.questionTitle")}
        </span>
      </div>
      {view.questions.map((q, qi) => (
        <div key={qi} className="mt-3">
          {q.header && (
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">{q.header}</div>
          )}
          <p className="mb-2 text-[13px] text-foreground">{q.question}</p>
          <div className="flex flex-col gap-1.5">
            {q.options.map((opt) => {
              const active = picked[qi] === opt.label;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() =>
                    setPicked((prev) => ({ ...prev, [qi]: prev[qi] === opt.label ? "" : opt.label }))
                  }
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background text-foreground/80 hover:bg-accent",
                  )}
                >
                  <span className="font-medium">{opt.label}</span>
                  {opt.description && (
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {opt.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <Input
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        placeholder={t("chat.questionOther")}
        aria-label={t("chat.questionOther")}
        className="mt-3"
      />
      <div className="mt-3 flex justify-end">
        <Button size="sm" disabled={!canSubmit} onClick={submit}>
          {t("chat.questionSubmit")}
        </Button>
      </div>
    </div>
  );
}
