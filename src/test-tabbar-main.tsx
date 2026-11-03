import { StrictMode, useRef } from "react";
import ReactDOM from "react-dom/client";
import { useAppStore } from "./stores/appStore";
import type { Session } from "./types";
import PaneViewNext from "./components/panes/PaneViewNext";
import PaneSplitter from "./components/panes/PaneSplitter";
import "./i18n";
import "./styles/shell.css";

/**
 * 浏览器端 TabBar 拖拽测试台（新骨架 TabBarNext）。
 *
 * 配合 tabbar-test.html 使用：注入两个 pane 与假会话，用 Playwright 做真实
 * HTML5 拖拽，验证插入落点与跨 pane 移动。dragover 阶段 dataTransfer 处于
 * 保护模式（getData 读不到内容），这类问题只有在真实浏览器里跑才暴露得出来。
 * window.__PANE_TABS__() 断言契约与旧测试台一致。
 */

const mkSession = (id: string, title: string): Session => ({
  id,
  projectId: "proj1",
  title,
  toolType: "claude",
  thinkingIntensity: "medium",
  isRunning: false,
  createdAt: 0,
  updatedAt: 0,
  sortOrder: 0,
});

const sessions = [
  mkSession("s1", "Alpha"),
  mkSession("s2", "Bravo"),
  mkSession("s3", "Charlie"),
  mkSession("s4", "Delta"),
];

useAppStore.setState({
  sessions,
  projects: [],
  panes: [
    { id: "p1", openTabIds: ["s1", "s2", "s3"], activeTabId: "s1" },
    { id: "p2", openTabIds: ["s4"], activeTabId: "s4" },
  ],
  activePaneId: "p1",
  openTabIds: ["s1", "s2", "s3", "s4"],
  activeTabId: "s1",
  splitRatio: 0.5,
  llmProviders: [],
});

declare global {
  interface Window {
    /** 读取各 pane 当前 tab 顺序，供测试脚本断言 */
    __PANE_TABS__?: () => string[][];
  }
}

window.__PANE_TABS__ = () => useAppStore.getState().panes.map((p) => p.openTabIds);

function Bench() {
  const containerRef = useRef<HTMLDivElement>(null);
  const splitRatio = useAppStore((s) => s.splitRatio);
  const setSplitRatio = useAppStore((s) => s.setSplitRatio);
  const panes = useAppStore((s) => s.panes);

  return (
    <div
      ref={containerRef}
      className="flex h-screen w-full overflow-hidden bg-background text-foreground"
    >
      {panes.map((pane, index) => (
        <div key={pane.id} className="flex min-w-0 flex-col" style={{ flexBasis: index === 0 ? `${splitRatio * 100}%` : `${(1 - splitRatio) * 100}%` }}>
          <div className="flex min-w-0 flex-1 flex-col border-border/60 [&:not(:first-child)]:border-l">
            <PaneViewNext paneId={pane.id} />
          </div>
          {index === 0 && panes.length >= 2 && (
            <PaneSplitter ratio={splitRatio} onRatioChange={setSplitRatio} containerRef={containerRef} />
          )}
        </div>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Bench />
  </StrictMode>,
);
