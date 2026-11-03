import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * className 合并工具：clsx 条件拼接 + tailwind-merge 冲突消解。
 * shadcn/ui 约定的 cn()，全项目组件样式合并统一走此函数。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
