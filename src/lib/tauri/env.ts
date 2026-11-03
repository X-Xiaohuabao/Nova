/**
 * Tauri 运行环境检测。
 *
 * 骨架组件（如交通灯）在纯浏览器预览时也渲染，此时所有 Tauri 调用
 * 必须静默降级，避免抛错；真实窗口下返回 true。
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 手机端视口判断（布局适配用，非通道判断）。
 * 通道选择以 isTauri() 为准；本函数只决定 UI 形态（侧栏折叠为抽屉等）。
 * 阈值 768px 对应主流手机横屏以上宽度。
 */
export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width: 768px)").matches ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 1024)
  );
}
