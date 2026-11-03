/**
 * 窗口控制封装（骨架预览与真实窗口双态可用）。
 *
 * 非 Tauri 环境（浏览器预览）下为 no-op；真实窗口下走 getCurrentWindow。
 * 交通灯按钮统一通过本模块操作窗口，禁止直接散落调用 @tauri-apps/api。
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./env";

/** 最小化窗口 */
export function minimizeWindow(): void {
  if (!isTauri()) return;
  void getCurrentWindow().minimize();
}

/** 最大化 / 还原窗口（按当前状态切换） */
export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauri()) return;
  const win = getCurrentWindow();
  if (await win.isMaximized()) {
    await win.unmaximize();
  } else {
    await win.maximize();
  }
}

/** 关闭窗口 */
export function closeWindow(): void {
  if (!isTauri()) return;
  void getCurrentWindow().close();
}
