// 会话模型选择的共享推导：NewSessionModalNext 与 SessionModelSwitcher 共用，
// 避免级联/默认值逻辑出现第二份（react-frontend 复制检测规则）。

import type { LlmProvider, ToolType } from "@/types";
import { TOOL_PROVIDER_KIND_MAP } from "@/types";
import type { ClaudeModels } from "@/utils/claudeModels";

/** 支持模型配置切换的智能体（无供应商体系的 terminal/ssh/antigravity 不参与） */
export const MODEL_SWITCHABLE_TOOLS: ToolType[] = ["claude", "codex", "gemini", "opencode"];

/** 工具兼容的 active 供应商（按 TOOL_PROVIDER_KIND_MAP） */
export function compatibleProviders(
  providers: LlmProvider[],
  toolType: ToolType | string,
): LlmProvider[] {
  const allowedKinds = TOOL_PROVIDER_KIND_MAP[toolType] ?? [];
  return providers.filter((p) => p.isActive && allowedKinds.includes(p.providerKind));
}

/** 工具的默认供应商：全局默认（兼容时）→ 第一个兼容供应商 */
export function pickDefaultProvider(
  providers: LlmProvider[],
  toolType: ToolType | string,
): LlmProvider | undefined {
  const compat = compatibleProviders(providers, toolType);
  return compat.find((p) => p.isDefault) ?? compat[0];
}

/** claude 全档同模型映射（快速切换语义；精细分档走编辑弹窗） */
export function buildDefaultClaudeModels(provider: LlmProvider): ClaudeModels {
  const defModel =
    provider.models.find((m) => m.isDefault)?.modelName ?? provider.models[0]?.modelName;
  if (!defModel) return {};
  return { sonnet: defModel, opus: defModel, haiku: defModel, fable: defModel, subagent: defModel };
}

/** 供应商的默认模型名（is_default 标记，缺省取第一个） */
export function providerDefaultModel(provider: LlmProvider): string | undefined {
  return provider.models.find((m) => m.isDefault)?.modelName ?? provider.models[0]?.modelName;
}
