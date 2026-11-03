/**
 * 标签页视觉工具：CLI 工具 → lucide 抽象图标 + 品牌色（摆脱 PNG，见 shadcn-ui skill 图标表）。
 */

import type { ComponentType } from "react";
import {
  Cable,
  Code2,
  Gem,
  Sparkles,
  SquareCode,
  SquareTerminal,
} from "lucide-react";
import type { ToolType } from "@/types";

interface ToolVisual {
  Icon: ComponentType<{ size?: number | string; strokeWidth?: number }>;
  color: string;
}

const TOOL_VISUALS: Record<ToolType, ToolVisual> = {
  claude: { Icon: Sparkles, color: "#722ed1" },
  codex: { Icon: SquareCode, color: "#1890ff" },
  gemini: { Icon: Gem, color: "#1677ff" },
  opencode: { Icon: Code2, color: "#fa8c16" },
  antigravity: { Icon: Code2, color: "#fa8c16" },
  terminal: { Icon: SquareTerminal, color: "#52c41a" },
  ssh: { Icon: Cable, color: "#1677ff" },
};

export function toolVisual(toolType: ToolType): ToolVisual {
  return TOOL_VISUALS[toolType] ?? TOOL_VISUALS.terminal;
}
