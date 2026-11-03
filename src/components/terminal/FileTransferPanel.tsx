import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import {
  CloudDownload,
  CloudUpload,
  Eye,
  EyeOff,
  File as FileIcon,
  Folder,
  FolderOpen,
  Maximize2,
  Minimize2,
  NotebookText,
  SquareX,
  X,
} from "lucide-react";
import {
  fsDelete,
  fsListDir,
  sshDelete,
  sshDownload,
  sshListDir,
  sshProbeRemoteCwd,
  sshTransferCancel,
  sshUpload,
  transferLogList,
  writeToPty,
} from "../../utils/ipc";
import { formatBytes, shellQuote } from "../../utils/shellQuote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import SshConnectionModalNext from "./SshConnectionModalNext";
import type {
  DirEntry,
  SshArgs,
  SshTarget,
  TransferLogRow,
  TransferProgress,
} from "../../types";

interface FileTransferPanelProps {
  tabId: string;
  toolType: string;
  /** 下载默认落点（项目目录）。无项目时为 null。 */
  workDir?: string | null;
  /**
   * 面板的 portal 宿主（终端根容器）。必须以它为包含块，
   * 否则百分比 max-height 会按按钮包装 div 的高度解析。
   */
  panelHostRef: React.RefObject<HTMLElement | null>;
}


/** 头部几个图标按钮的统一样式。去掉 outline：点过之后 WebKit 会留下一个
 *  聚焦框，看着像按钮自带边框。 */
const ICON_BTN_STYLE = {
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--color-muted-foreground)",
  padding: 2,
  outline: "none",
} as const;

const PANEL_STYLE = {
  width: 760,
  // 跟随终端区域高度：写死数值会在矮终端里被裁掉顶部
  maxHeight: "calc(100% - 2.5rem)",
  background: "var(--color-card)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  boxShadow: "0 6px 24px rgba(0,0,0,0.28)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
} as const;

/**
 * 左右拖动删除的触发阈值（像素）。
 *
 * 小于此位移视为普通点击 —— 用户想选中文件，不该一碰就弹删除框。
 */
const DELETE_DRAG_THRESHOLD = 40;

/** 路径的上一级。`/root/a` → `/root`；`/` 仍是 `/`。 */
function parentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  if (trimmed === "" || trimmed === "/") return "/";
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

/** `YYYY/MM/DD`。 */
function formatDate(unixSec: number | null): string {
  if (unixSec === null) return "";
  const d = new Date(unixSec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
}

/** `YYYY-MM-DD HH:mm:ss`。到秒 —— 文件时间要精确到秒才有排查价值。 */
function formatDateTime(unixSec: number | null): string {
  if (unixSec === null || unixSec <= 0) return "未知";
  const d = new Date(unixSec * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** `HH:MM:SS`。 */
function formatClock(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function FileTransferPanel({
  tabId,
  toolType,
  workDir,
  panelHostRef,
}: FileTransferPanelProps) {
  const supported = toolType === "ssh" || toolType === "terminal";
  const isSsh = toolType === "ssh";

  const [open, setOpen] = useState(false);
  /** 放大后铺满终端区域，再点恢复。照抄 TranscriptPanel 的做法。 */
  const [maximized, setMaximized] = useState(false);
  /** 是否列出隐藏文件。眼睛图标切换，远程与本地两栏一起生效。 */
  const [showHidden, setShowHidden] = useState(true);
  const [connModalOpen, setConnModalOpen] = useState(false);

  /** Terminal 会话没有远程信息，只能手填一次；填完存到 state，不落库。 */
  const [manualArgs, setManualArgs] = useState<SshArgs | null>(null);

  // 路径只有一份状态（输入框里显示的就是被列举的路径），另配一个刷新计数：
  // 边打字边列举会连着开一堆 SSH 连接，代价远大于收益；而计数让「路径没变也
  // 重新列举」成为可能 —— 直接 set 同一个值会被 React 当成没变而跳过。
  const [remotePath, setRemotePath] = useState("~/");
  const [remoteRev, setRemoteRev] = useState(0);
  const [localPath, setLocalPath] = useState(workDir ?? "");
  const [localRev, setLocalRev] = useState(0);

  // 列举时读路径的当前值。放 ref 是因为列举不该被「打字」触发，
  // 但 ref 里的值永远是最新的。
  const remotePathRef = useRef(remotePath);
  remotePathRef.current = remotePath;
  const localPathRef = useRef(localPath);
  localPathRef.current = localPath;

  const [remoteEntries, setRemoteEntries] = useState<DirEntry[]>([]);
  const [localEntries, setLocalEntries] = useState<DirEntry[]>([]);
  const [remoteSel, setRemoteSel] = useState<string[]>([]);
  const [localSel, setLocalSel] = useState<string[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  /**
   * 日志表的行。数据源是数据库 —— 后端写完就发事件，前端收到后重新查。
   * 前端不再自己维护行，否则内存一份、库里一份会对不上。
   */
  const [logs, setLogs] = useState<TransferLogRow[]>([]);
  /**
   * 实时进度。进度事件很密（每 200ms 一条），不落库，只在内存里跟着走，
   * 按 request_id 对到具体某一行。
   */
  const [progressMap, setProgressMap] = useState<
    Record<
      string,
      { bytes: number; totalBytes: number | null; transferId: string }
    >
  >({});
  /** 「全部历史」：看所有会话的记录，而不只是当前会话的。 */
  const [showAllHistory, setShowAllHistory] = useState(false);
  /**
   * 待删除的对象。用受控 Modal 而不是命令式的 Modal.confirm ——
   * 确认框弹出期间要屏蔽面板的「点外面关闭」，得知道它开着。
   */
  const [deleteTarget, setDeleteTarget] = useState<{
    entry: DirEntry;
    side: "remote" | "local";
  } | null>(null);

  const requestSeq = useRef(0);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const targetFor = useCallback((): SshTarget | null => {
    if (isSsh) return { kind: "fromSession", sessionId: tabId };
    if (manualArgs) {
      return {
        kind: "manual",
        hostname: manualArgs.hostname,
        port: manualArgs.port,
        username: manualArgs.username || undefined,
        password: manualArgs.password || undefined,
        identityFile: manualArgs.identityFile || undefined,
      };
    }
    return null;
  }, [isSsh, tabId, manualArgs]);

  /**
   * 目标标识。放进依赖数组用 —— `targetFor()` 每次渲染都返回新对象，
   * 直接进依赖会让列举 effect 每帧重跑。刻意不含密码。
   */
  const targetKey = isSsh
    ? `s:${tabId}`
    : manualArgs
      ? `m:${manualArgs.hostname}:${manualArgs.port}:${manualArgs.username}`
      : "";

  // 版本号让「路径没变也重新列举」成为可能：直接 set 同一个路径值会被
  // React 当成没变而跳过，列表就停在旧内容上。
  /** 只重新列举当前目录，不动路径输入框。 */
  const refreshRemote = useCallback(() => setRemoteRev((v) => v + 1), []);
  const refreshLocal = useCallback(() => setLocalRev((v) => v + 1), []);

  /** 重新查日志表。默认只看当前会话的，切到「全部历史」时看所有。 */
  const reloadLogs = useCallback(async () => {
    const rows = await transferLogList(showAllHistory ? null : tabId, 200).catch(
      () => [] as TransferLogRow[],
    );
    setLogs(rows);
  }, [tabId, showAllHistory]);

  const applyRemote = useCallback((p: string) => {
    setRemotePath(p);
    setRemoteRev((v) => v + 1);
  }, []);
  const applyLocal = useCallback((p: string) => {
    setLocalPath(p);
    setLocalRev((v) => v + 1);
  }, []);

  // 进度事件 → 实时进度。进度很密，不落库，只在内存里按 requestId 跟着走。
  useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | undefined;
    const unlisten = listen<TransferProgress>("ssh_transfer:progress", (event) => {
      const p = event.payload;
      if (p.tabId !== tabId) return;
      setProgressMap((prev) => ({
        ...prev,
        [p.requestId]: {
          bytes: p.bytes,
          totalBytes: p.totalBytes,
          transferId: p.transferId,
        },
      }));
    });
    void unlisten.then(
      (fn) => {
        // 卸载可能早于注册完成，此时立即退订，否则监听会一直挂着
        if (disposed) fn();
        else dispose = fn;
      },
      () => {
        // 监听注册失败不该拖垮面板，进度只是锦上添花
      },
    );
    return () => {
      disposed = true;
      dispose?.();
    };
  }, [tabId]);

  // 面板打开时探测远程 cwd。探测失败不是错误 —— 回落 ~/，输入框一直可改。
  useEffect(() => {
    if (!open || !isSsh) return;
    let cancelled = false;
    void (async () => {
      try {
        const cwd = await sshProbeRemoteCwd(tabId);
        if (!cancelled) applyRemote(cwd);
      } catch {
        if (!cancelled) applyRemote("~/");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isSsh, tabId, applyRemote]);

  // 列举远程目录
  useEffect(() => {
    if (!open) return;
    if (!targetKey) {
      setRemoteEntries([]);
      setRemoteError(null);
      setRemoteLoading(false);
      return;
    }
    const target = targetFor();
    if (!target) return;
    let cancelled = false;
    const path = remotePathRef.current;
    setRemoteLoading(true);
    void sshListDir(target, path, showHidden)
      .then((entries) => {
        if (cancelled) return;
        setRemoteEntries(entries);
        setRemoteSel([]);
        setRemoteError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setRemoteEntries([]);
        setRemoteError(typeof e === "string" ? e : "无法列出远程目录");
      })
      .finally(() => {
        if (!cancelled) setRemoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, remoteRev, targetKey, targetFor, showHidden]);

  // 列举本地目录
  useEffect(() => {
    if (!open || !localPath) return;
    let cancelled = false;
    const path = localPathRef.current;
    setLocalLoading(true);
    void fsListDir(path, showHidden)
      .then((entries) => {
        if (cancelled) return;
        setLocalEntries(entries);
        setLocalSel([]);
        setLocalError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setLocalEntries([]);
        setLocalError(typeof e === "string" ? e : "无法列出本地目录");
      })
      .finally(() => {
        if (!cancelled) setLocalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, localRev, showHidden]);

  // 项目目录后到时补上默认落点
  useEffect(() => {
    if (!localPath && workDir) applyLocal(workDir);
  }, [workDir, localPath, applyLocal]);

  // 后端写完日志会广播这个事件，收到就重新查表。
  useEffect(() => {
    if (!open) return;
    let disposed = false;
    let dispose: (() => void) | undefined;
    const unlisten = listen("transfer_log_changed", () => {
      void reloadLogs();
    });
    void unlisten.then(
      (fn) => {
        if (disposed) fn();
        else dispose = fn;
      },
      () => {},
    );
    return () => {
      disposed = true;
      dispose?.();
    };
  }, [open, reloadLogs]);

  // 打开面板时查一次库；「全部历史」切换后也重新查。
  useEffect(() => {
    if (!open) return;
    void reloadLogs();
  }, [open, reloadLogs]);

  // 点击按钮或面板之外的任何位置都收起面板。pointerdown 早于 click，
  // 打开面板的那一次点击不会落到这里（此时 open 还是 false）。
  // 按钮与面板分属两个容器（面板经 portal 挂在终端根节点下），必须分别判断。
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      // 删除确认框开着的时候，点任何地方都不能把面板关掉 ——
      // 否则确认框的遮罩一按，连文件传输窗口一起没了
      if (deleteTarget) return;
      const target = e.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, deleteTarget]);

  const nextRequestId = () => {
    requestSeq.current += 1;
    return `r${Date.now().toString(36)}-${requestSeq.current}`;
  };

  /** 上传若干本地文件 → 远程当前目录。 */
  const startUploads = (files: DirEntry[]) => {
    if (!targetKey) {
      setConnModalOpen(true);
      return;
    }
    const target = targetFor();
    if (!target) return;

    for (const f of files) {
      const requestId = nextRequestId();
      void sshUpload({
        target,
        tabId,
        localPaths: [f.path],
        remotePath: remotePathRef.current,
        requestId,
      })
        .then(() => {
          // 传完就把对端目录重新列一遍：刚落地的文件要立刻出现在列表里
          refreshRemote();
        })
        .catch(() => {});
    }
  };

  /** 下载若干远程文件 → 本地当前目录。 */
  const startDownloads = (files: DirEntry[]) => {
    if (!targetKey) {
      setConnModalOpen(true);
      return;
    }
    const target = targetFor();
    if (!target) return;

    for (const f of files) {
      const requestId = nextRequestId();
      void sshDownload({
        target,
        tabId,
        remotePath: f.path,
        localDir: localPathRef.current,
        requestId,
      })
        .then(() => refreshLocal())
        .catch(() => {});
    }
  };

  /** 取消进行中的传输。后端的 transferId 由进度事件带来，存在进度 map 里。 */
  const cancelRow = async (requestId: string | null) => {
    const live = requestId ? progressMap[requestId] : undefined;
    if (!live) return;
    await sshTransferCancel(live.transferId).catch(() => {});
  };

  /** 确认删除：删完刷新**源列表**（远程删的刷远端，本地删的刷本地）。 */
  const confirmDelete = async () => {
    const pending = deleteTarget;
    setDeleteTarget(null);
    if (!pending) return;
    try {
      if (pending.side === "remote") {
        const target = targetFor();
        if (!target) return;
        // tabId 即会话 id —— 删除日志的会话归属要靠它按会话过滤
        await sshDelete(target, pending.entry.path, tabId);
        refreshRemote();
      } else {
        await fsDelete(pending.entry.path, tabId);
        refreshLocal();
      }
    } catch (e) {
      toast.error(typeof e === "string" ? e : "删除失败");
    }
  };

  /** Terminal 会话的本地路径插入：裸写 PTY，不带回车。
   *
   * 用户多半是要把它作为正在输入的命令的参数，自动回车等于替他执行了。
   */
  const handleInsertPath = async () => {
    const picked = await openDialog({ directory: false, multiple: false });
    if (typeof picked !== "string") return;
    await writeToPty(tabId, `${shellQuote(picked)} `);
  };

  if (!supported) return null;

  /**
   * 表格行 = 库里的行 + 内存里的实时进度。
   *
   * 库里的行按 created_at 倒序，最新的在最上面。
   */
  const tableRows = logs.map((r) => {
    const live = r.requestId ? progressMap[r.requestId] : undefined;
    return {
      ...r,
      liveBytes: live?.bytes ?? null,
      liveTotal: live?.totalBytes ?? null,
    };
  });

  return (
    <>
      <button
        ref={buttonRef}
        title={isSsh ? "文件传输" : "本地文件 / 传文件"}
        aria-label={isSsh ? "文件传输" : "本地文件 / 传文件"}
          onClick={() => {
            setOpen((v) => !v);
          }}
          className="flex items-center justify-center rounded-full transition-all"
          style={{
            width: 32,
            height: 32,
            backgroundColor: open
              ? "var(--color-primary)"
              : "var(--color-card)",
            border: "1px solid var(--color-border)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            cursor: "pointer",
            color: open ? "#fff" : "var(--color-muted-foreground)",
          }}
        >
          {isSsh ? (
            <CloudUpload size={14} />
          ) : (
            <NotebookText size={14} />
          )}
        </button>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          // 点遮罩不关：免得误触把确认框和面板一起弄没了
          if (!o) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 {deleteTarget?.entry.name ?? ""}？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.entry.isDir
                ? "该文件夹及其全部内容都会被永久删除，此操作不可撤销。"
                : "该文件会被永久删除，此操作不可撤销。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => void confirmDelete()}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SshConnectionModalNext
        open={connModalOpen}
        onClose={() => setConnModalOpen(false)}
        onConfirm={(args) => {
          setManualArgs(args);
        }}
      />

      {open &&
        panelHostRef.current &&
        createPortal(
          <div
            ref={panelRef}
            className={`absolute z-20 flex flex-col ${
              // 上、右都留 2.5rem（10），与右边的距离对称
              maximized ? "top-0 right-0" : "top-10 right-10"
            }`}
            style={{
              ...PANEL_STYLE,
              width: maximized ? "100%" : PANEL_STYLE.width,
              // 全屏时高度也铺满，只给宽度不够
              height: maximized ? "100%" : undefined,
              maxHeight: maximized ? "100%" : PANEL_STYLE.maxHeight,
              borderRadius: maximized ? 0 : PANEL_STYLE.borderRadius,
            }}
          >
            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <span className="text-sm font-medium flex-1">文件传输</span>
              <button
                onClick={() => setShowHidden((v) => !v)}
                aria-label={showHidden ? "不显示隐藏文件" : "显示隐藏文件"}
                title={showHidden ? "不显示隐藏文件" : "显示隐藏文件"}
                style={ICON_BTN_STYLE}
              >
                {showHidden ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                onClick={() => setMaximized((v) => !v)}
                aria-label={maximized ? "恢复默认大小" : "最大化"}
                title={maximized ? "恢复默认大小" : "最大化"}
                style={ICON_BTN_STYLE}
              >
                {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
              <button onClick={() => setOpen(false)} aria-label="关闭" style={ICON_BTN_STYLE}>
                <X size={13} />
              </button>
            </div>

            <div

              className="flex px-3 pt-2"
              style={{
                gap: 6,
                // 多出来的空间给文件列表，日志表紧贴面板底部（下方不留空白）
                flex: "1 1 auto",
                minHeight: 0,
                // 列表底边到下方分隔线的留白，两栏统一
                paddingBottom: 5,
              }}
            >
              <FilePane
                title="远程文件目录"
                path={remotePath}
                onPathChange={setRemotePath}
                onApply={() => applyRemote(remotePath)}
                entries={remoteEntries}
                loading={remoteLoading}
                error={remoteError}
                selected={remoteSel}
                onToggle={(p) =>
                  setRemoteSel((prev) =>
                    prev.includes(p)
                      ? prev.filter((x) => x !== p)
                      : [...prev, p],
                  )
                }
                onNavigate={(p) => applyRemote(p)}
                onActivate={(e) => startDownloads([e])}
                onDelete={(e) => setDeleteTarget({ entry: e, side: "remote" })}
                listMaxHeight={maximized ? "none" : 300}
                placeholder="远程目录，如 /var/log"
                hint={
                  isSsh
                    ? undefined
                    : "本地终端会话没有远程信息，需先填写连接参数"
                }
                extra={
                  !isSsh && !targetKey ? (
                    <Button size="xs" variant="outline" onClick={() => setConnModalOpen(true)}>
                      填写参数
                    </Button>
                  ) : null
                }
              />
              <div
                className="flex flex-col items-center justify-center"
                style={{ width: 30, gap: 50 }}
              >
                <button
                  title="上传到远程（本地 → 远程）"
                  aria-label="上传到远程（本地 → 远程）"
                    onClick={() =>
                      startUploads(
                        localEntries.filter(
                          (e) => !e.isDir && localSel.includes(e.path),
                        ),
                      )
                    }
                    className="flex flex-col items-center justify-center rounded transition-all"
                    style={{
                      width: 28,
                      padding: "3px 0",
                      gap: 1,
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      cursor: "pointer",
                      color: "var(--color-muted-foreground)",
                      fontSize: 10,
                      lineHeight: "10px",
                    }}
                  >
                    <CloudUpload size={13} />
                    <span>&lt;&lt;</span>
                  </button>
                <button
                  title="从远程下载（远程 → 本地）"
                  aria-label="从远程下载（远程 → 本地）"
                    onClick={() =>
                      startDownloads(
                        remoteEntries.filter(
                          (e) => !e.isDir && remoteSel.includes(e.path),
                        ),
                      )
                    }
                    className="flex flex-col items-center justify-center rounded transition-all"
                    style={{
                      width: 28,
                      padding: "3px 0",
                      gap: 1,
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      cursor: "pointer",
                      color: "var(--color-muted-foreground)",
                      fontSize: 10,
                      lineHeight: "10px",
                    }}
                  >
                    <CloudDownload size={13} />
                    <span>&gt;&gt;</span>
                  </button>
              </div>
              <FilePane
                title="本地文件目录"
                path={localPath}
                onPathChange={setLocalPath}
                onApply={() => applyLocal(localPath)}
                entries={localEntries}
                loading={localLoading}
                error={localError}
                selected={localSel}
                onToggle={(p) =>
                  setLocalSel((prev) =>
                    prev.includes(p)
                      ? prev.filter((x) => x !== p)
                      : [...prev, p],
                  )
                }
                onNavigate={(p) => applyLocal(p)}
                onActivate={(e) => startUploads([e])}
                onDelete={(e) => setDeleteTarget({ entry: e, side: "local" })}
                listMaxHeight={maximized ? "none" : 300}
                placeholder="本地目录，如 /home/me/proj"
                extra={
                  !isSsh ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      aria-label="插入本地路径到终端"
                      title="插入本地路径到终端"
                      onClick={() => void handleInsertPath()}
                    >
                      <NotebookText size={12} />
                    </Button>
                  ) : null
                }
              />
            </div>

            <div
              className="px-3 pt-2"
              style={{
                borderTop: "1px solid var(--color-border)",
                // 表格底边到面板底边的留白
                paddingBottom: 5,
              }}
            >
              <div className="flex items-center mb-1">
                <span className="text-xs font-medium flex-1 truncate">
                  同步进度和日志
                  <span
                    className="ml-2 text-[var(--color-muted-foreground)]"
                    style={{ fontSize: 10 }}
                  >
                    （上方的文件列表窗口中，左右拖动文件名即可
                    <span style={{ color: "var(--color-destructive)" }}>删除</span>
                    文件）
                  </span>
                </span>
                <label className="flex items-center gap-1" title="切到全部会话的记录">
                  <Switch checked={showAllHistory} onCheckedChange={setShowAllHistory} />
                  <span className="text-[10px] text-muted-foreground">全部历史</span>
                </label>
              </div>
              <div className="max-h-[132px] overflow-y-auto rounded border border-border/60">
                <table className="transfer-log-table w-full text-[10px]">
                  <thead className="sticky top-0 bg-card">
                    <tr>
                      <th className="px-2 py-1 text-center font-medium">方式</th>
                      <th className="px-2 py-1 text-left font-medium">文件名</th>
                      <th className="px-2 py-1 text-center font-medium">大小</th>
                      <th className="px-2 py-1 text-center font-medium">开始时间</th>
                      <th className="px-2 py-1 text-center font-medium">状态/进度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground/60">
                          暂无传输记录
                        </td>
                      </tr>
                    )}
                    {tableRows.map((row) => {
                      const kindTip = row.kind === "delete"
                        ? `删除（${row.side === "local" ? "本地" : "远程"}）`
                        : row.kind === "upload"
                          ? "上传"
                          : "下载";
                      const bytes = row.liveBytes ?? row.bytes ?? 0;
                      const total = row.liveTotal ?? row.bytes ?? 0;
                      const percent = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0;
                      return (
                        <tr key={row.requestId} className="border-t border-border/40">
                          <td className="px-2 py-0.5 text-center" title={kindTip}>
                            {row.kind === "upload" ? (
                              <CloudUpload size={12} className="mx-auto text-primary" />
                            ) : row.kind === "download" ? (
                              <CloudDownload size={12} className="mx-auto text-success" />
                            ) : (
                              <SquareX size={12} className="mx-auto text-destructive" />
                            )}
                          </td>
                          <td className="max-w-0 truncate px-2 py-0.5" title={row.path ?? row.name}>
                            {row.name}
                          </td>
                          <td className="px-2 py-0.5 text-center tabular-nums">
                            {row.bytes === null ? "—" : formatBytes(row.bytes)}
                          </td>
                          <td className="px-2 py-0.5 text-center tabular-nums">{formatClock(row.createdAt)}</td>
                          <td className="px-2 py-0.5 text-center">
                            {row.state === "error" ? (
                              <span className="text-[10px] text-destructive" title={row.error ?? undefined}>
                                {row.error ?? "失败"}
                              </span>
                            ) : row.kind === "delete" ? (
                              <span className="text-[10px] text-muted-foreground">已删除</span>
                            ) : total <= 0 ? (
                              <span className="text-[10px] text-muted-foreground">
                                {row.state === "running" ? `已传 ${formatBytes(bytes)}` : "已完成"}
                              </span>
                            ) : (
                              <div className="flex items-center gap-1">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div
                                    className="h-full rounded-full transition-[width]"
                                    style={{
                                      width: row.state === "running" ? `${percent}%` : "100%",
                                      background: row.state === "running" ? "var(--color-primary)" : "var(--color-success)",
                                    }}
                                  />
                                </div>
                                <span className="w-8 tabular-nums text-muted-foreground">
                                  {row.state === "running" ? `${percent}%` : "100%"}
                                </span>
                                {row.state === "running" && (
                                  <button
                                    title="取消"
                                    aria-label="取消"
                                    className="text-muted-foreground hover:text-foreground"
                                    onClick={() => void cancelRow(row.requestId)}
                                  >
                                    <SquareX size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>,
          panelHostRef.current,
        )}
    </>
  );
}

/** 一栏文件列表：路径输入框 + 可导航的条目列表。 */
function FilePane({
  title,
  path,
  onPathChange,
  onApply,
  entries,
  loading,
  error,
  selected,
  onToggle,
  onNavigate,
  onActivate,
  onDelete,
  placeholder,
  listMaxHeight,
  hint,
  extra,
}: {
  title: string;
  path: string;
  onPathChange: (p: string) => void;
  onApply: () => void;
  entries: DirEntry[];
  loading: boolean;
  error: string | null;
  selected: string[];
  onToggle: (path: string) => void;
  onNavigate: (path: string) => void;
  /** 双击文件条目时触发（文件夹的双击仍是进入目录）。 */
  onActivate?: (entry: DirEntry) => void;
  /** 左右拖动条目时触发删除（由父组件弹确认框）。 */
  onDelete?: (entry: DirEntry) => void;
  placeholder: string;
  /** 列表的最大高度。全屏时放开，上限交给面板。 */
  listMaxHeight?: number | string;
  /** 没有内容可列时的原因说明，比「空目录」有信息量。 */
  hint?: string;
  extra?: React.ReactNode;
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  /**
   * 左右拖动删除的手势状态。
   *
   * 自己判定而不是用浏览器的 drag 事件：HTML 的 drag 只对可拖对象生效，
   * 而这里要的是「按住条目左右挪」。
   */
  const dragRef = useRef<{
    path: string;
    startX: number;
    startY: number;
    dx: number;
    /** 已经越过阈值，进入拖动删除态 */
    active: boolean;
    /** 判定为上下拖动，整段手势作废 */
    abandoned: boolean;
  } | null>(null);
  /** 当前正在拖动的条目与位移，让条目跟着鼠标走 */
  const [dragOffset, setDragOffset] = useState<{ path: string; dx: number } | null>(null);
  /**
   * 拖动删除触发后抑制随之而来的 click，免得又去切换选中。
   *
   * 用时间窗而不是布尔标志：拖动结束时未必真的派发 click（指针可能在条目外
   * 松手），布尔标志会一直挂着，把下一次正常点击也吞掉。
   */
  const suppressClickUntilRef = useRef(0);

  const onEntryPointerDown = (e: React.PointerEvent, entry: DirEntry) => {
    if (e.button !== 0) return;
    dragRef.current = {
      path: entry.path,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      active: false,
      abandoned: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onEntryPointerMove = (e: React.PointerEvent, entry: DirEntry) => {
    const st = dragRef.current;
    if (!st || st.path !== entry.path || st.abandoned) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (!st.active) {
      // 还没攒够位移，先不动 —— 否则单击选中会被误判成拖动
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        // 上下为主：不是删除手势，整段作废
        st.abandoned = true;
        dragRef.current = null;
        return;
      }
      st.active = true;
    }
    st.dx = dx;
    setDragOffset({ path: entry.path, dx });
  };

  const onEntryPointerUp = (_e: React.PointerEvent, entry: DirEntry) => {
    const st = dragRef.current;
    dragRef.current = null;
    setDragOffset(null);
    if (!st || st.path !== entry.path || !st.active || st.abandoned) return;
    if (Math.abs(st.dx) < DELETE_DRAG_THRESHOLD) return;
    suppressClickUntilRef.current = Date.now() + 300;
    onDelete?.(entry);
  };


  /**
   * 双击判定自己做，不靠 onDoubleClick。
   *
   * 浏览器把两次点击合成 dblclick 的条件（间隔、位置）在不同后端上并不一致，
   * 合成事件更是常常只给出两次 click。自己记时间戳更可控。
   */
  const lastClickRef = useRef<{ path: string; at: number } | null>(null);

  const handleClick = (e: DirEntry) => {
    if (e.isDir) {
      onNavigate(e.path);
      return;
    }
    const now = Date.now();
    const last = lastClickRef.current;
    if (last && last.path === e.path && now - last.at < 400) {
      // 第二次点击：当作双击，传文件
      lastClickRef.current = null;
      onActivate?.(e);
      return;
    }
    lastClickRef.current = { path: e.path, at: now };
    onToggle(e.path);
  };

  return (
    <div
      className="flex flex-col"
      style={{ flex: 1, minWidth: 0, gap: 4 }}
    >
      <div className="flex items-center gap-1">
        <span className="text-xs" style={{ whiteSpace: "nowrap" }}>
          {title}:
        </span>
        <Input
          className="h-7 flex-1 text-xs"
          value={path}
          onChange={(e) => onPathChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onApply();
          }}
          placeholder={placeholder}
        />
        {extra}
      </div>
      <div
        className="overflow-y-auto"
        style={{
          flex: "1 1 auto",
          minHeight: 120,
          maxHeight: listMaxHeight ?? 300,
          overflowY: "auto",
          border: "1px solid var(--color-border)",
          borderRadius: 6,
          padding: 2,
        }}
      >
        {error && (
          <div
            className="text-xs px-2 py-1"
            style={{ color: "var(--color-destructive)" }}
          >
            {error}
          </div>
        )}
        {!error && loading && entries.length === 0 && (
          <div className="text-xs px-2 py-1 text-[var(--color-muted-foreground)]">
            读取中…
          </div>
        )}
        {!error && !loading && entries.length === 0 && (
          <div className="text-xs px-2 py-1 text-[var(--color-muted-foreground)]">
            {hint ?? (path.trim() ? "空目录" : "请填写目录路径")}
          </div>
        )}
        <ParentEntry path={path} onNavigate={onNavigate} />
        {entries.map((e) => {
          const active = selectedSet.has(e.path);
          return (
            <div
              key={e.path}
              title={`${e.path}｜大小：${e.isDir ? "—" : formatBytes(e.size)}｜创建：${formatDateTime(e.created)}｜修改：${formatDateTime(e.modified)}`}
              style={{ lineHeight: "1.6" }}
            >
              <div
                className="flex items-center gap-1 px-1 py-0.5 cursor-pointer rounded"
                style={{
                  background: active
                    ? "var(--color-accent)"
                    : "transparent",
                  fontSize: 10,
                  // 拖动删除时条目跟着鼠标走，并给出「松手即删」的提示色
                  transform:
                    dragOffset?.path === e.path
                      ? `translateX(${dragOffset.dx}px)`
                      : undefined,
                  color:
                    dragOffset?.path === e.path &&
                    Math.abs(dragOffset.dx) >= DELETE_DRAG_THRESHOLD
                      ? "var(--color-destructive)"
                      : undefined,
                }}
                onPointerDown={(ev) => onEntryPointerDown(ev, e)}
                onPointerMove={(ev) => onEntryPointerMove(ev, e)}
                onPointerUp={(ev) => onEntryPointerUp(ev, e)}
                onClick={() => {
                  if (Date.now() < suppressClickUntilRef.current) return;
                  handleClick(e);
                }}
              >
                {e.isDir ? (
                  <Folder size={12} className="text-muted-foreground/70" />
                ) : (
                  <FileIcon size={12} className="text-muted-foreground/70" />
                )}
                <span className="flex-1 truncate" style={{ fontSize: 12 }}>
                  {e.name}
                </span>
                <span style={{ color: "var(--color-muted-foreground)" }}>
                  {formatDate(e.modified)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 列表顶部的「..」—— 回上一级。 */
function ParentEntry({
  path,
  onNavigate,
}: {
  path: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 px-1 py-0.5 cursor-pointer rounded"
      onClick={() => onNavigate(parentPath(path))}
      title="上一级"
    >
      <FolderOpen size={12} className="text-muted-foreground/70" />
      <span className="flex-1 text-xs truncate">..</span>
    </div>
  );
}
