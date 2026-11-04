//! Claude Code Driver：`claude -p --input-format stream-json --output-format stream-json`
//! 双向子进程，NDJSON 按行读写。
//!
//! 协议事实来源：官方 TS SDK 文档（SDKMessage 五类 / 流式输入多轮 / interrupt）。
//! control_request 权限流为非官方承诺部分，T5 实测接通；本文件解析层对未知
//! 消息类型宽容跳过（协议漂移不 panic）。

// T1 骨架提交：IPC 命令层（T2）接线前无外部调用方，框架期豁免 dead_code（同 cost 模块 v0.1.0 先例）
#![allow(dead_code)]

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;

use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex as AsyncMutex;

use super::{
    AgentDriver, AgentError, AgentEvent, AgentEventPayload, AgentManager, AgentSessionState,
    TurnUsage,
};

/// 组装 Claude headless 双向模式的最小参数集。
///
/// `--include-partial-messages` 提供 stream_event 增量（打字机效果输入源）；
/// delta 事件形态属 PoC 验证项（T5），缺失时 UI 退化为按块渲染，通道不依赖它。
fn base_args() -> Vec<String> {
    [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// 把一行 NDJSON（SDKMessage）映射为零或多条归一事件。
///
/// 纯函数、无 IO：协议样例直接进单元测试。
/// 未知 type / subtype 一律跳过——CLI 新版本加字段、加消息类型时老客户端不崩。
pub fn parse_sdk_message(line: &str) -> Vec<AgentEvent> {
    let value: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => {
            // CLI 偶发输出非 JSON 行（如告警）；跳过但不吞掉线索
            eprintln!("[AGENT] 非 JSON 行: {}", line.chars().take(200).collect::<String>());
            return Vec::new();
        }
    };

    let msg_type = value.get("type").and_then(|v| v.as_str()).unwrap_or("");
    match msg_type {
        "system" => parse_system(&value),
        "assistant" => parse_assistant(&value),
        "user" => parse_user_tool_result(&value),
        "result" => parse_result(&value),
        "stream_event" => parse_stream_event(&value),
        "control_request" => vec![parse_control_request(&value)],
        _ => Vec::new(),
    }
}

/// system init → SessionReady（携带 CLI 版本，供协议兼容性提示）。
fn parse_system(value: &serde_json::Value) -> Vec<AgentEvent> {
    let subtype = value.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
    if subtype != "init" {
        return Vec::new();
    }
    vec![AgentEvent::SessionReady {
        cli_version: value
            .get("claude_code_version")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        claude_session_id: value
            .get("session_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
    }]
}

/// assistant 消息：遍历 content 块——text → MessageComplete，tool_use → ToolUse；
/// AskUserQuestion 类工具调用归一为 QuestionRequest（应答走 tool_result 而非执行）。
/// thinking 块 MVP 不展示（跳过）。
fn parse_assistant(value: &serde_json::Value) -> Vec<AgentEvent> {
    let Some(blocks) = value
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
    else {
        return Vec::new();
    };
    blocks
        .iter()
        .filter_map(|block| {
            match block.get("type").and_then(|v| v.as_str()).unwrap_or("") {
                "text" => block.get("text").and_then(|v| v.as_str()).map(|text| {
                    AgentEvent::MessageComplete { text: text.to_string() }
                }),
                "tool_use" => {
                    let tool_use_id = block
                        .get("id")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let name = block
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let input = block
                        .get("input")
                        .cloned()
                        .unwrap_or(serde_json::Value::Null);
                    if name.contains("AskUserQuestion") {
                        Some(AgentEvent::QuestionRequest { tool_use_id, input })
                    } else {
                        // tool_use 即代表智能体要动手：进入 thinking（等 result）
                        Some(AgentEvent::ToolUse { tool_use_id, name, input })
                    }
                }
                _ => None,
            }
        })
        .collect()
}

/// user 消息在此协议里主要承载 tool_result（CLI 自己回填的工具产物）。
fn parse_user_tool_result(value: &serde_json::Value) -> Vec<AgentEvent> {
    let Some(blocks) = value
        .get("message")
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_array())
    else {
        return Vec::new();
    };
    blocks
        .iter()
        .filter_map(|block| {
            if block.get("type").and_then(|v| v.as_str()) != Some("tool_result") {
                return None;
            }
            let tool_use_id = block
                .get("tool_use_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            // content 可能是字符串，也可能是块数组（如图像）；统一抽文本
            let content = extract_tool_result_text(block.get("content"));
            let is_error = block
                .get("is_error")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            Some(AgentEvent::ToolResult { tool_use_id, content, is_error })
        })
        .collect()
}

/// tool_result 的 content 双形态归一为纯文本。
fn extract_tool_result_text(content: Option<&serde_json::Value>) -> String {
    match content {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(blocks)) => blocks
            .iter()
            .filter_map(|b| {
                if b.get("type").and_then(|v| v.as_str()) == Some("text") {
                    b.get("text").and_then(|v| v.as_str()).map(|s| s.to_string())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

/// result → TurnEnded（用量统计）+ 回到 Idle。
fn parse_result(value: &serde_json::Value) -> Vec<AgentEvent> {
    let usage = value
        .get("usage")
        .map(|u| TurnUsage {
            input_tokens: u.get("input_tokens").and_then(|v| v.as_u64()),
            output_tokens: u.get("output_tokens").and_then(|v| v.as_u64()),
            cache_creation_input_tokens: u
                .get("cache_creation_input_tokens")
                .and_then(|v| v.as_u64()),
            cache_read_input_tokens: u.get("cache_read_input_tokens").and_then(|v| v.as_u64()),
            cost_usd: value.get("cost_usd").and_then(|v| v.as_f64()),
        })
        .unwrap_or_default();
    vec![
        AgentEvent::TurnEnded {
            usage,
            is_error: value.get("is_error").and_then(|v| v.as_bool()).unwrap_or(false),
            duration_ms: value.get("duration_ms").and_then(|v| v.as_u64()),
        },
        AgentEvent::StateChanged { state: AgentSessionState::Idle },
    ]
}

/// stream_event → text_delta 增量（打字机效果）。
/// 事件结构与 Anthropic Messages API 的流事件同构，仅取 text_delta，其余跳过。
fn parse_stream_event(value: &serde_json::Value) -> Vec<AgentEvent> {
    let delta_type = value
        .get("event")
        .and_then(|e| e.get("delta"))
        .and_then(|d| d.get("type"))
        .and_then(|v| v.as_str());
    if delta_type != Some("text_delta") {
        return Vec::new();
    }
    value
        .get("event")
        .and_then(|e| e.get("delta"))
        .and_then(|d| d.get("text"))
        .and_then(|v| v.as_str())
        .map(|text| vec![AgentEvent::MessageDelta { delta: text.to_string() }])
        .unwrap_or_default()
}

/// control_request（can_use_tool / AskUserQuestion 落到提示流时）→ PermissionRequest。
/// 应答（control_response）写回在 T5 接通；此处先归一透出。
fn parse_control_request(value: &serde_json::Value) -> AgentEvent {
    let request_id = value
        .get("request_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let request = value.get("request").cloned().unwrap_or(serde_json::Value::Null);
    let tool_name = request
        .get("tool_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let input = request.get("input").cloned().unwrap_or(serde_json::Value::Null);
    AgentEvent::PermissionRequest { request_id, tool_name, input }
}

/// Claude 会话驱动实现。
pub struct ClaudeDriver {
    session_id: String,
    stdin: AsyncMutex<tokio::process::ChildStdin>,
    state: Arc<std::sync::Mutex<AgentSessionState>>,
}

/// 启动参数（T2 命令层组装后传入：环境注入 / 模型 / 恢复会话等）。
pub struct ClaudeStartParams {
    pub session_id: String,
    pub work_dir: String,
    pub env_vars: HashMap<String, String>,
    pub extra_args: Vec<String>,
}

/// 展开工作目录中的 `~`：Windows 下 "~" 不是合法路径，必须替换为用户目录。
fn expand_home_dir(work_dir: &str) -> std::path::PathBuf {
    if work_dir == "~" || work_dir.is_empty() {
        return dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
    }
    std::path::PathBuf::from(work_dir)
}

/// 启动 Claude 子进程：spawn + 读循环任务 + 注册到 Manager。
///
/// Windows 上 npm 安装的 claude 是 `.cmd` shim，CreateProcess 无法直接执行，
/// 必须经 `cmd /C` 包装（PTY 通道由 portable-pty 内部处理同一问题）。
pub async fn start_claude(
    app: tauri::AppHandle,
    manager: Arc<AgentManager>,
    params: ClaudeStartParams,
) -> Result<(), AgentError> {
    let exe = which::which("claude")
        .map_err(|e| AgentError::SpawnFailed(format!("未找到 claude 可执行文件: {e}")))?;

    let work_dir = expand_home_dir(&params.work_dir);
    if !work_dir.is_dir() {
        return Err(AgentError::SpawnFailed(format!(
            "工作目录不存在: {}",
            work_dir.display()
        )));
    }

    let mut cmd = if cfg!(windows) {
        let mut c = Command::new("cmd");
        c.arg("/C").arg(&exe);
        c
    } else {
        Command::new(&exe)
    };
    cmd.args(base_args())
        .args(&params.extra_args)
        .current_dir(&work_dir)
        .env("TERM", "dumb") // headless 无 TUI 交互，禁用终端控制序列
        .envs(&params.env_vars)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Windows 下避免每次 spawn 闪控制台窗口（tokio Command 内置 creation_flags）
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| AgentError::SpawnFailed(format!("claude 进程启动失败: {e}")))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AgentError::SpawnFailed("无法获取 stdout".to_string()))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AgentError::SpawnFailed("无法获取 stdin".to_string()))?;
    // stderr 必须被消费：无人读的 piped stderr 缓冲区写满后会阻塞子进程。
    // claude 的运行期错误（认证/配额）走 stderr，逐行转发为 Error 事件。
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AgentError::SpawnFailed("无法获取 stderr".to_string()))?;

    let session_id = params.session_id;
    let state = Arc::new(std::sync::Mutex::new(AgentSessionState::Starting));

    let driver = Arc::new(ClaudeDriver {
        session_id: session_id.clone(),
        stdin: AsyncMutex::new(stdin),
        state: state.clone(),
    });
    manager.register(session_id.clone(), driver, child);

    // stdout 读循环：EOF / 进程退出 → SessionEnded 并清表
    tokio::spawn(read_loop(app.clone(), manager, session_id.clone(), stdout, state));
    // stderr 读循环：错误文案透出（headless 模式通常仅在故障时有输出）
    tokio::spawn(stderr_loop(app, session_id, stderr));

    Ok(())
}

/// stderr 逐行 → Error 事件。
async fn stderr_loop(
    app: tauri::AppHandle,
    session_id: String,
    stderr: tokio::process::ChildStderr,
) {
    let mut lines = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        let _ = app.emit(
            "agent:message",
            AgentEventPayload {
                session_id: session_id.clone(),
                event: AgentEvent::Error { message: line },
            },
        );
    }
}

/// stdout 逐行读循环。
async fn read_loop(
    app: tauri::AppHandle,
    manager: Arc<AgentManager>,
    session_id: String,
    stdout: tokio::process::ChildStdout,
    state: Arc<std::sync::Mutex<AgentSessionState>>,
) {
    let sid = session_id.clone();
    let reader = BufReader::new(stdout);
    let mut lines = reader.lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                for event in parse_sdk_message(&line) {
                    apply_state(&state, &event);
                    let payload = AgentEventPayload {
                        session_id: sid.clone(),
                        event: event.clone(),
                    };
                    let _ = app.emit(super::event_channel(&event), payload);
                }
            }
            Ok(None) | Err(_) => {
                manager.unregister(&sid);
                let _ = app.emit(
                    "agent:state",
                    AgentEventPayload {
                        session_id: sid.clone(),
                        event: AgentEvent::SessionEnded { reason: None },
                    },
                );
                break;
            }
        }
    }
}

/// 状态机推进：SessionReady → Idle；assistant 事件 → Thinking；
/// PermissionRequest → WaitingInput；result → Idle（parse_result 已附 StateChanged，
/// 但 Assistant 路径的状态推进在这里做，保持解析函数纯）。
fn apply_state(state: &std::sync::Mutex<AgentSessionState>, event: &AgentEvent) {
    let next = match event {
        AgentEvent::SessionReady { .. } => Some(AgentSessionState::Idle),
        AgentEvent::MessageDelta { .. }
        | AgentEvent::MessageComplete { .. }
        | AgentEvent::ToolUse { .. }
        | AgentEvent::ToolResult { .. } => Some(AgentSessionState::Thinking),
        AgentEvent::PermissionRequest { .. } | AgentEvent::QuestionRequest { .. } => {
            Some(AgentSessionState::WaitingInput)
        }
        AgentEvent::StateChanged { state: s } => Some(*s),
        _ => None,
    };
    if let Some(next) = next {
        let mut guard = state.lock().unwrap_or_else(|e| e.into_inner());
        *guard = next;
    }
}

/// 组装 user 消息 JSON 行（stream-json 输入格式）。
fn user_message_line(text: &str) -> Result<String, AgentError> {
    let value = serde_json::json!({
        "type": "user",
        "message": { "role": "user", "content": text },
    });
    serde_json::to_string(&value).map_err(|e| AgentError::Protocol(format!("user 消息序列化失败: {e}")))
}

/// 组装权限应答 control_response 帧（can_use_tool 的 behavior 语义）。
fn permission_response_line(request_id: &str, allow: bool) -> Result<String, AgentError> {
    let response = if allow {
        serde_json::json!({ "behavior": "allow" })
    } else {
        serde_json::json!({ "behavior": "deny", "message": "用户拒绝了该操作" })
    };
    let frame = serde_json::json!({
        "type": "control_response",
        "request_id": request_id,
        "response": response,
    });
    serde_json::to_string(&frame)
        .map_err(|e| AgentError::Protocol(format!("control_response 序列化失败: {e}")))
}

/// 组装提问应答 user 消息（tool_result 块终结 AskUserQuestion 的 tool_use）。
fn tool_result_line(tool_use_id: &str, text: &str) -> Result<String, AgentError> {
    let value = serde_json::json!({
        "type": "user",
        "message": {
            "role": "user",
            "content": [
                { "type": "tool_result", "tool_use_id": tool_use_id, "content": text }
            ]
        },
    });
    serde_json::to_string(&value).map_err(|e| AgentError::Protocol(format!("tool_result 消息序列化失败: {e}")))
}

/// 往 stdin 写一行 JSON（行尾换行 + flush，stream-json 按行分帧）。
async fn write_line(stdin: &mut tokio::process::ChildStdin, line: &str) -> Result<(), AgentError> {
    stdin.write_all(line.as_bytes()).await.map_err(to_write_err)?;
    stdin.write_all(b"\n").await.map_err(to_write_err)?;
    stdin.flush().await.map_err(to_write_err)
}

/// IO 错误统一转 WriteFailed（附上下文，便于区分进程已死与管道抖动）。
fn to_write_err(e: std::io::Error) -> AgentError {
    AgentError::WriteFailed(format!("stdin 写入失败: {e}"))
}

#[async_trait::async_trait]
impl AgentDriver for ClaudeDriver {
    async fn send(&self, text: &str) -> Result<(), AgentError> {
        let line = user_message_line(text)?;
        let mut stdin = self.stdin.lock().await;
        write_line(&mut stdin, &line).await
    }

    async fn interrupt(&self) -> Result<(), AgentError> {
        // 协议层中断（官方 SDK interrupt() 的子进程形态）：
        // 往输入流写 control_request interrupt 帧，进程与上下文保留。
        let frame = serde_json::json!({
            "type": "control_request",
            "request_id": uuid::Uuid::new_v4().to_string(),
            "request": { "subtype": "interrupt" },
        });
        let line = serde_json::to_string(&frame)
            .map_err(|e| AgentError::Protocol(format!("interrupt 帧序列化失败: {e}")))?;
        let mut stdin = self.stdin.lock().await;
        write_line(&mut stdin, &line).await
    }

    async fn respond_permission(&self, request_id: &str, allow: bool) -> Result<(), AgentError> {
        let line = permission_response_line(request_id, allow)?;
        let mut stdin = self.stdin.lock().await;
        write_line(&mut stdin, &line).await
    }

    async fn answer_question(&self, tool_use_id: &str, text: &str) -> Result<(), AgentError> {
        let line = tool_result_line(tool_use_id, text)?;
        let mut stdin = self.stdin.lock().await;
        write_line(&mut stdin, &line).await
    }

    fn state(&self) -> AgentSessionState {
        *self.state.lock().unwrap_or_else(|e| e.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 官方 SDK system init 消息样例
    #[test]
    fn parse_system_init() {
        let line = r#"{"type":"system","subtype":"init","session_id":"s-abc","claude_code_version":"2.1.205","tools":["Bash"]}"#;
        let events = parse_sdk_message(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            AgentEvent::SessionReady { cli_version, claude_session_id } => {
                assert_eq!(cli_version.as_deref(), Some("2.1.205"));
                assert_eq!(claude_session_id.as_deref(), Some("s-abc"));
            }
            other => panic!("预期 SessionReady，实际 {other:?}"),
        }
    }

    /// assistant 文本块 → MessageComplete
    #[test]
    fn parse_assistant_text() {
        let line = r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"你好，世界"}]},"session_id":"s-abc"}"#;
        let events = parse_sdk_message(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            AgentEvent::MessageComplete { text } => assert_eq!(text, "你好，世界"),
            other => panic!("预期 MessageComplete，实际 {other:?}"),
        }
    }

    /// assistant 混合块（thinking + tool_use）→ 仅 tool_use 透出
    #[test]
    fn parse_assistant_tool_use() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"thinking","thinking":"想想"},{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"ls"}}]}}"#;
        let events = parse_sdk_message(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            AgentEvent::ToolUse { tool_use_id, name, input } => {
                assert_eq!(tool_use_id, "toolu_1");
                assert_eq!(name, "Bash");
                assert_eq!(input["command"], "ls");
            }
            other => panic!("预期 ToolUse，实际 {other:?}"),
        }
    }

    /// user tool_result（字符串形态）→ ToolResult
    #[test]
    fn parse_tool_result_string() {
        let line = r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"file1\nfile2","is_error":false}]}}"#;
        let events = parse_sdk_message(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            AgentEvent::ToolResult { tool_use_id, content, is_error } => {
                assert_eq!(tool_use_id, "toolu_1");
                assert_eq!(content, "file1\nfile2");
                assert!(!is_error);
            }
            other => panic!("预期 ToolResult，实际 {other:?}"),
        }
    }

    /// result → TurnEnded（用量）+ Idle
    #[test]
    fn parse_result_usage() {
        let line = r#"{"type":"result","subtype":"success","is_error":false,"duration_ms":1234,"cost_usd":0.0123,"usage":{"input_tokens":10,"output_tokens":20,"cache_creation_input_tokens":5,"cache_read_input_tokens":100},"session_id":"s-abc"}"#;
        let events = parse_sdk_message(line);
        assert_eq!(events.len(), 2);
        match (&events[0], &events[1]) {
            (
                AgentEvent::TurnEnded { usage, is_error, duration_ms },
                AgentEvent::StateChanged { state },
            ) => {
                assert_eq!(usage.input_tokens, Some(10));
                assert_eq!(usage.output_tokens, Some(20));
                assert_eq!(usage.cost_usd, Some(0.0123));
                assert!(!is_error);
                assert_eq!(*duration_ms, Some(1234));
                assert_eq!(*state, AgentSessionState::Idle);
            }
            other => panic!("预期 TurnEnded+Idle，实际 {other:?}"),
        }
    }

    /// stream_event text_delta → MessageDelta；非 text_delta 跳过
    #[test]
    fn parse_stream_event_delta() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"你"}},"session_id":"s-abc"}"#;
        let events = parse_sdk_message(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            AgentEvent::MessageDelta { delta } => assert_eq!(delta, "你"),
            other => panic!("预期 MessageDelta，实际 {other:?}"),
        }

        let thinking = r#"{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"..."}}}"#;
        assert!(parse_sdk_message(thinking).is_empty());
    }

    /// 未知消息类型 / 非 JSON 行 → 空向量不 panic（协议漂移宽容性）
    #[test]
    fn parse_unknown_and_garbage_tolerated() {
        assert!(parse_sdk_message(r#"{"type":"future_message","data":1}"#).is_empty());
        assert!(parse_sdk_message("not json at all").is_empty());
        assert!(parse_sdk_message("").is_empty());
    }

    /// control_request → PermissionRequest 归一
    #[test]
    fn parse_control_request() {
        let line = r#"{"type":"control_request","request_id":"req-1","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{"command":"rm -rf /"}}}"#;
        let events = parse_sdk_message(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            AgentEvent::PermissionRequest { request_id, tool_name, input } => {
                assert_eq!(request_id, "req-1");
                assert_eq!(tool_name, "Bash");
                assert_eq!(input["command"], "rm -rf /");
            }
            other => panic!("预期 PermissionRequest，实际 {other:?}"),
        }
    }

    /// user 消息组装格式
    #[test]
    fn user_message_line_format() {
        let line = user_message_line("继续").expect("序列化不应失败");
        let v: serde_json::Value = serde_json::from_str(&line).expect("应为合法 JSON");
        assert_eq!(v["type"], "user");
        assert_eq!(v["message"]["role"], "user");
        assert_eq!(v["message"]["content"], "继续");
    }

    /// 权限应答 control_response 帧格式（allow / deny 两态）
    #[test]
    fn permission_response_line_format() {
        let allow = permission_response_line("req-1", true).expect("序列化不应失败");
        let v: serde_json::Value = serde_json::from_str(&allow).expect("应为合法 JSON");
        assert_eq!(v["type"], "control_response");
        assert_eq!(v["request_id"], "req-1");
        assert_eq!(v["response"]["behavior"], "allow");

        let deny = permission_response_line("req-1", false).expect("序列化不应失败");
        let v: serde_json::Value = serde_json::from_str(&deny).expect("应为合法 JSON");
        assert_eq!(v["response"]["behavior"], "deny");
        assert!(v["response"]["message"].is_string());
    }

    /// 提问应答 tool_result 消息格式（终结 AskUserQuestion 的 tool_use）
    #[test]
    fn tool_result_line_format() {
        let line = tool_result_line("toolu_9", "选方案 B").expect("序列化不应失败");
        let v: serde_json::Value = serde_json::from_str(&line).expect("应为合法 JSON");
        assert_eq!(v["type"], "user");
        assert_eq!(v["message"]["content"][0]["type"], "tool_result");
        assert_eq!(v["message"]["content"][0]["tool_use_id"], "toolu_9");
        assert_eq!(v["message"]["content"][0]["content"], "选方案 B");
    }

    /// AskUserQuestion 工具调用归一为 QuestionRequest（应答走 tool_result）
    #[test]
    fn parse_ask_user_question() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_q","name":"AskUserQuestion","input":{"questions":[{"question":"用哪个方案？","options":[{"label":"A"},{"label":"B"}]}]}}]}}"#;
        let events = parse_sdk_message(line);
        assert_eq!(events.len(), 1);
        match &events[0] {
            AgentEvent::QuestionRequest { tool_use_id, input } => {
                assert_eq!(tool_use_id, "toolu_q");
                assert_eq!(input["questions"][0]["question"], "用哪个方案？");
            }
            other => panic!("预期 QuestionRequest，实际 {other:?}"),
        }
    }
}
