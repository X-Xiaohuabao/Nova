import { Toaster } from "@/components/ui/sonner";
import AppNext from "./components/layout/AppNext";

/**
 * 应用入口：新骨架组装根（shadcn/ui + macOS 语义 token）。
 * 旧 AntD AppLayout 已由 AppNext 接管（T15 拆除时删除旧链路文件）。
 */
function App() {
  return (
    <>
      <AppNext />
      <Toaster position="bottom-right" />
    </>
  );
}

export default App;
