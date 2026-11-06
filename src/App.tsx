/**
 * 应用入口：新骨架组装根（shadcn/ui + macOS 语义 token）。
 * 路由化（M2）：HashRouter 承载视图切换（tauri:// 协议无服务器 fallback，
 * 必须 hash 模式）；路由结构见 AppNext。
 */

import { HashRouter } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import AppNext from "./components/layout/AppNext";

function App() {
  return (
    <HashRouter>
      <AppNext />
      <Toaster position="bottom-right" />
    </HashRouter>
  );
}

export default App;
