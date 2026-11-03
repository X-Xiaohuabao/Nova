//! 远程访问 WS 服务骨架（RA3）。
//!
//! - enabled=true 时监听 `0.0.0.0:<port>`，false 时不监听；由 [`sync`] 依据
//!   配置与当前运行态决策启停/重启（set_config 命令联动）
//! - WS 路由 `/ws`：消费 invoke 帧（白名单校验）→ 回 result 帧（id 匹配）；
//!   GET / 及其余路径由静态资源兜底（服务前端 dist，供远程浏览器加载 UI）
//! - 命令白名单注册表：🔴 RA4 配对鉴权落地前**仅 remote_ping**（无凭据、只读），
//!   禁止扩充；凭据类命令永久禁止入表（红线）
//! - 日志脱敏：不记录帧内容与参数，仅生命周期事件

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, OnceLock};

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use axum::routing::get;
use axum::Router;
use serde_json::{json, Value};
use tokio::sync::mpsc;
use tower_http::services::ServeDir;

use super::frames::WsFrame;
use super::RemoteAccessConfig;

/// 远程命令处理器：入参为 invoke.args，返回 result.data 或错误信息
type RemoteHandler = Arc<dyn Fn(Value) -> Result<Value, String> + Send + Sync>;

/// 远程命令白名单注册表。
///
/// 🔴 扩充前置条件：RA4 配对鉴权已落地且该命令不涉凭据（凭据类永久禁止）。
fn registry() -> &'static HashMap<&'static str, RemoteHandler> {
    static REGISTRY: OnceLock<HashMap<&'static str, RemoteHandler>> = OnceLock::new();
    REGISTRY.get_or_init(|| {
        let mut map: HashMap<&'static str, RemoteHandler> = HashMap::new();
        map.insert(
            "remote_ping",
            Arc::new(|_args: Value| {
                Ok(json!({ "pong": true, "ts": chrono::Utc::now().timestamp_millis() }))
            }),
        );
        map
    })
}

/// 分发 invoke 帧；白名单外命令一律拒绝（错误信息含命令名，不含参数）
fn dispatch(cmd: &str, args: Value) -> Result<Value, String> {
    let handler = registry().get(cmd).ok_or_else(|| format!("命令不在远程白名单: {cmd}"))?;
    handler(args)
}

/// 服务运行态句柄：优雅停机信号 + 任务句柄 + 实际绑定端口
pub struct RunningServer {
    shutdown_tx: mpsc::Sender<()>,
    task: tokio::task::JoinHandle<()>,
    /// 实际绑定端口（与请求端口一致；测试可传 0 由系统分配）
    port: u16,
}

impl RunningServer {
    fn port(&self) -> u16 {
        self.port
    }
}

/// 停机决策（纯函数，便于单测）；启动需求由返回的端口表达
#[derive(Debug, PartialEq, Eq)]
enum StopDecision {
    /// 现役实例保持不动
    Keep,
    /// 停止现役实例（期望关闭，或端口变更需先停再启）
    Stop,
}

fn decide_action(
    running_port: Option<u16>,
    desired: &RemoteAccessConfig,
) -> (StopDecision, Option<u16>) {
    match (running_port, desired.enabled) {
        (None, false) => (StopDecision::Keep, None),
        (None, true) => (StopDecision::Keep, Some(desired.port)),
        (Some(_), false) => (StopDecision::Stop, None),
        (Some(p), true) if p == desired.port => (StopDecision::Keep, None),
        (Some(_), true) => (StopDecision::Stop, Some(desired.port)),
    }
}

/// 前端 dist 目录探测：优先 exe 同级 dist（打包形态），其次上级 dist（开发形态）
fn frontend_dir() -> PathBuf {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(PathBuf::from))
        .unwrap_or_default();
    for candidate in [exe_dir.join("dist"), exe_dir.join("..").join("dist")] {
        if candidate.is_dir() {
            return candidate;
        }
    }
    // 不存在时 ServeDir 对所有路径返回 404，不影响 WS 路由
    PathBuf::from("dist")
}

fn build_router() -> Router {
    Router::new()
        .route("/ws", get(ws_upgrade))
        .fallback_service(ServeDir::new(frontend_dir()))
}

async fn ws_upgrade(upgrade: WebSocketUpgrade) -> Response {
    upgrade.on_upgrade(ws_bridge)
}

/// 单连接帧循环：invoke → 白名单分发 → result（id 匹配）。
/// 顺序处理即可满足当前白名单（remote_ping 立即返回）；引入耗时命令时再升级为
/// 写端任务化，避免慢命令阻塞读循环。
async fn ws_bridge(mut socket: WebSocket) {
    while let Some(Ok(msg)) = socket.recv().await {
        let Message::Text(text) = msg else {
            continue;
        };
        let Ok(WsFrame::Invoke { id, cmd, args }) = serde_json::from_str::<WsFrame>(&text) else {
            // result / event 帧与非 JSON 内容：忽略且不落日志（脱敏）
            continue;
        };

        let reply = match dispatch(&cmd, args) {
            Ok(data) => WsFrame::Result { id, ok: true, data, error: String::new() },
            Err(error) => WsFrame::Result { id, ok: false, data: Value::Null, error },
        };
        let Ok(text) = serde_json::to_string(&reply) else {
            continue;
        };
        if socket.send(Message::text(text)).await.is_err() {
            break;
        }
    }
}

/// 启动 WS 服务并监听 `0.0.0.0:<port>`
async fn start(port: u16) -> Result<RunningServer, String> {
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| format!("远程访问服务绑定 0.0.0.0:{port} 失败: {e}"))?;
    let bound_port = listener
        .local_addr()
        .map_err(|e| format!("读取监听地址失败: {e}"))?
        .port();

    let task = tokio::spawn(async move {
        let serve = axum::serve(listener, build_router())
            .with_graceful_shutdown(async move {
                // 停机信号通道关闭即触发优雅退出
                let _ = shutdown_rx.recv().await;
            });
        if let Err(e) = serve.await {
            eprintln!("远程访问服务异常退出: {e}");
        }
    });

    eprintln!("远程访问服务已启动，监听 0.0.0.0:{bound_port}");
    Ok(RunningServer { shutdown_tx, task, port: bound_port })
}

/// 停止服务：发停机信号并等待任务退出（超时 3 秒兜底中止）
async fn stop(server: RunningServer) {
    let RunningServer { shutdown_tx, mut task, .. } = server;
    if shutdown_tx.send(()).await.is_ok() {
        let _ = tokio::time::timeout(std::time::Duration::from_secs(3), &mut task).await;
    } else {
        task.abort();
    }
    eprintln!("远程访问服务已停止");
}

/// 全局现役服务实例（跨 IPC 命令共享；tokio Mutex 因跨 await 持有）
static RUNNING: tokio::sync::Mutex<Option<RunningServer>> = tokio::sync::Mutex::const_new(None);

/// 依据配置同步服务运行态（remote_set_config 联动入口）
pub async fn sync(config: &RemoteAccessConfig) -> Result<(), String> {
    let mut guard = RUNNING.lock().await;
    let (action, start_port) = decide_action(guard.as_ref().map(RunningServer::port), config);

    if action == StopDecision::Stop {
        if let Some(server) = guard.take() {
            stop(server).await;
        }
    }
    if let Some(port) = start_port {
        let server = start(port).await?;
        *guard = Some(server);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(enabled: bool, port: u16) -> RemoteAccessConfig {
        RemoteAccessConfig { enabled, port }
    }

    #[test]
    fn 启停决策覆盖全部分支() {
        // 未运行 + 期望关闭 → 保持不动
        assert_eq!(decide_action(None, &config(false, 1)), (StopDecision::Keep, None));
        // 未运行 + 期望开启 → 启动指定端口
        assert_eq!(decide_action(None, &config(true, 47001)), (StopDecision::Keep, Some(47001)));
        // 运行中 + 期望关闭 → 停止
        assert_eq!(decide_action(Some(47001), &config(false, 1)), (StopDecision::Stop, None));
        // 运行中同端口 → 保持
        assert_eq!(decide_action(Some(47001), &config(true, 47001)), (StopDecision::Keep, None));
        // 运行中异端口 → 先停再启新端口
        assert_eq!(decide_action(Some(47001), &config(true, 47002)), (StopDecision::Stop, Some(47002)));
    }

    #[tokio::test]
    async fn 服务可启停且绑定请求端口() {
        // 端口 0 由系统分配，避免测试端口冲突
        let server = start(0).await.expect("启动失败");
        assert_ne!(server.port, 0);
        stop(server).await;
    }

    #[tokio::test]
    async fn 白名单分发与拒绝() {
        let pong = dispatch("remote_ping", json!({})).expect("remote_ping 应在白名单");
        assert_eq!(pong["pong"], json!(true));

        // 凭据类命令必须在白名单外（红线）
        let err = dispatch("get_profile_credential", json!({})).expect_err("凭据类命令必须被拒绝");
        assert!(err.contains("远程白名单"));
    }
}
