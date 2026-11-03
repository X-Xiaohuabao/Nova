/**
 * 模型价格配置面板（新骨架，E2 / T13）。
 *
 * 单价表（输入/输出/缓存创建/缓存读取，$/1K tokens）行内编辑，
 * 保存走 updatePricing IPC；自定义模型带标记。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { listPricing, updatePricing } from "@/utils/ipc";
import type { PricingConfig } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatPrice(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `$${v}`;
}

/** 价格列定义（键与 PricingConfig 字段一致） */
const PRICE_COLUMNS: { key: keyof PricingEditValues; labelKey: string; step: number }[] = [
  { key: "inputPrice", labelKey: "cost.priceInput", step: 0.01 },
  { key: "outputPrice", labelKey: "cost.priceOutput", step: 0.01 },
  { key: "cacheCreationPrice", labelKey: "cost.priceCacheCreation", step: 0.001 },
  { key: "cacheReadPrice", labelKey: "cost.priceCacheRead", step: 0.001 },
];

interface PricingEditValues {
  inputPrice: number | null;
  outputPrice: number | null;
  cacheCreationPrice: number | null;
  cacheReadPrice: number | null;
}

export default function PricingConfigPanelNext() {
  const { t } = useTranslation();
  const [pricing, setPricing] = useState<PricingConfig[]>([]);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<PricingEditValues>({
    inputPrice: null,
    outputPrice: null,
    cacheCreationPrice: null,
    cacheReadPrice: null,
  });

  useEffect(() => {
    listPricing()
      .then(setPricing)
      .catch(() => toast.error(t("cost.pricingLoadFailed")));
  }, [t]);

  const startEdit = (model: string) => {
    const row = pricing.find((p) => p.model === model);
    if (!row) return;
    setEditingModel(model);
    setEditValues({
      inputPrice: row.inputPrice,
      outputPrice: row.outputPrice,
      cacheCreationPrice: row.cacheCreationPrice,
      cacheReadPrice: row.cacheReadPrice,
    });
  };

  const saveEdit = async (model: string) => {
    try {
      await updatePricing(model, {
        inputPrice: editValues.inputPrice ?? undefined,
        outputPrice: editValues.outputPrice ?? undefined,
        cacheCreationPrice: editValues.cacheCreationPrice ?? undefined,
        cacheReadPrice: editValues.cacheReadPrice ?? undefined,
      });
      const updated = await listPricing();
      setPricing(updated);
      setEditingModel(null);
      toast.success(t("cost.pricingSaved"));
    } catch {
      toast.error(t("cost.pricingSaveFailed"));
    }
  };

  return (
    <div className="rounded-lg border border-border/70 bg-card">
      <div className="border-b border-border/60 px-3 py-2 text-[13px] font-medium">
        {t("cost.pricingTitle")}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs">
          <thead>
            <tr className="border-b border-border/60 text-left text-muted-foreground/70">
              <th className="px-3 py-2 font-medium">{t("cost.model")}</th>
              {PRICE_COLUMNS.map((col) => (
                <th key={col.key} className="px-3 py-2 text-right font-medium">
                  {t(col.labelKey)}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">{t("cost.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {pricing.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground/60">
                  {t("cost.pricingEmpty")}
                </td>
              </tr>
            )}
            {pricing.map((row) => {
              const editing = editingModel === row.model;
              return (
                <tr key={row.model} className="border-b border-border/40 last:border-b-0">
                  <td className="px-3 py-2">
                    <span className="font-mono">{row.model}</span>
                    {row.isCustom && (
                      <Badge variant="secondary" className="ml-1.5 px-1 py-0 text-[9px]">
                        {t("cost.custom")}
                      </Badge>
                    )}
                  </td>
                  {PRICE_COLUMNS.map((col) => (
                    <td key={col.key} className="px-3 py-1.5 text-right tabular-nums">
                      {editing ? (
                        <Input
                          className="ml-auto h-6 w-24 text-right text-xs"
                          type="number"
                          min={0}
                          step={col.step}
                          value={editValues[col.key] ?? ""}
                          onChange={(e) =>
                            setEditValues((prev) => ({
                              ...prev,
                              [col.key]: e.target.value === "" ? null : Number(e.target.value),
                            }))
                          }
                        />
                      ) : (
                        formatPrice(row[col.key] as number | null | undefined)
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right">
                    {editing ? (
                      <div className="flex justify-end gap-1">
                        <Button size="xs" onClick={() => void saveEdit(row.model)}>
                          {t("common.save")}
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setEditingModel(null)}>
                          {t("common.cancel")}
                        </Button>
                      </div>
                    ) : (
                      <Button size="xs" variant="ghost" onClick={() => startEdit(row.model)}>
                        {t("common.edit")}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
