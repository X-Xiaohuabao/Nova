/**
 * 费用仪表盘（新骨架，E1 / T13）。
 *
 * 全局汇总卡 + 各 Profile 明细表；扫描走 scanCosts IPC（读 CLI 本地 JSONL，
 * 非解析 PTY）；日期范围以预设档位（全部/近7天/近30天）替代旧 RangePicker。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { RotateCw } from "lucide-react";
import { getGlobalCost, getProfileCost, scanCosts } from "@/utils/ipc";
import { useAppStore } from "@/stores/appStore";
import { TOOL_DISPLAY_NAMES } from "@/types";
import type { CostSummary } from "@/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(usd: number): string {
  if (usd >= 100) return `$${usd.toFixed(2)}`;
  if (usd >= 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

/** 预设时间范围档位 */
type RangePreset = "all" | "7d" | "30d";

const RANGE_OPTIONS: { value: RangePreset; labelKey: string; days?: number }[] = [
  { value: "all", labelKey: "cost.rangeAll" },
  { value: "7d", labelKey: "cost.range7d", days: 7 },
  { value: "30d", labelKey: "cost.range30d", days: 30 },
];

function toTimeRange(preset: RangePreset): { from: number; to: number } | undefined {
  const option = RANGE_OPTIONS.find((o) => o.value === preset);
  if (!option?.days) return undefined;
  const to = Date.now();
  const from = to - option.days * 24 * 60 * 60 * 1000;
  return { from, to };
}

export default function CostDashboardNext() {
  const { t } = useTranslation();
  const profiles = useAppStore((s) => s.profiles);
  const [globalCost, setGlobalCost] = useState<CostSummary | null>(null);
  const [profileCosts, setProfileCosts] = useState<Record<string, CostSummary>>({});
  const [scanning, setScanning] = useState(false);
  const [range, setRange] = useState<RangePreset>("all");

  useEffect(() => {
    const timeRange = toTimeRange(range);
    getGlobalCost(timeRange)
      .then(setGlobalCost)
      .catch(() => {});
    profiles.forEach((p) => {
      getProfileCost(p.id, timeRange)
        .then((cost) => {
          setProfileCosts((prev) => ({ ...prev, [p.id]: cost }));
        })
        .catch(() => {});
    });
  }, [profiles, range]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const count = await scanCosts();
      toast.success(t("cost.scanned", { count }));
      const timeRange = toTimeRange(range);
      getGlobalCost(timeRange)
        .then(setGlobalCost)
        .catch(() => {});
      profiles.forEach((p) => {
        getProfileCost(p.id, timeRange)
          .then((cost) => setProfileCosts((prev) => ({ ...prev, [p.id]: cost })))
          .catch(() => {});
      });
    } catch {
      toast.error(t("cost.scanFailed"));
    } finally {
      setScanning(false);
    }
  };

  const stats = [
    { label: t("cost.totalCost"), value: formatCost(globalCost?.costUsd || 0) },
    { label: t("cost.inputTokens"), value: formatTokens(globalCost?.inputTokens || 0) },
    { label: t("cost.outputTokens"), value: formatTokens(globalCost?.outputTokens || 0) },
    {
      label: t("cost.cacheTokens"),
      value: formatTokens((globalCost?.cacheCreationTokens || 0) + (globalCost?.cacheReadTokens || 0)),
    },
  ];

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">{t("cost.title")}</h3>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRange(option.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors",
                  range === option.value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/60",
                )}
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => void handleScan()} disabled={scanning}>
            <RotateCw size={14} className={scanning ? "animate-spin" : ""} />
            {t("cost.scan")}
          </Button>
        </div>
      </div>

      {/* 汇总卡 */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border/70 bg-card p-3">
            <div className="text-[11px] text-muted-foreground/70">{stat.label}</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Profile 明细表 */}
      <div className="rounded-lg border border-border/70 bg-card">
        <div className="border-b border-border/60 px-3 py-2 text-[13px] font-medium">
          {t("cost.profileBreakdown")}
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/60 text-left text-muted-foreground/70">
              <th className="px-3 py-2 font-medium">Profile</th>
              <th className="px-3 py-2 font-medium">{t("cost.tool")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("cost.inputTokens")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("cost.outputTokens")}</th>
              <th className="hidden px-3 py-2 text-right font-medium md:table-cell">{t("cost.cacheCreation")}</th>
              <th className="hidden px-3 py-2 text-right font-medium md:table-cell">{t("cost.cacheRead")}</th>
              <th className="px-3 py-2 text-right font-medium">{t("cost.totalCost")}</th>
            </tr>
          </thead>
          <tbody>
            {profiles.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground/60">
                  {t("cost.empty")}
                </td>
              </tr>
            )}
            {profiles.map((p) => {
              const cost = profileCosts[p.id] || {
                inputTokens: 0,
                outputTokens: 0,
                cacheCreationTokens: 0,
                cacheReadTokens: 0,
                costUsd: 0,
              };
              return (
                <tr key={p.id} className="border-b border-border/40 last:border-b-0">
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2">
                    <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">
                      {TOOL_DISPLAY_NAMES[p.toolType]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatTokens(cost.inputTokens)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatTokens(cost.outputTokens)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatTokens(cost.cacheCreationTokens)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums md:table-cell">{formatTokens(cost.cacheReadTokens)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCost(cost.costUsd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
