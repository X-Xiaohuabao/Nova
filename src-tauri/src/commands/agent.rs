//! 智能体聊天通道 IPC 命令（与 PTY 通道平行的独立子进程通道）。

use std::collections::HashMap;
use std::sync::Arc;

use crate::agent::claude::{start_claude, ClaudeStartParams};
use crate::agent::AgentManager;
use crate::cli::ToolType;
use crate::storage::AppDatabase;

/// 启动智能体聊天会话（当前仅 Claude：stream-json 双向子进程）。
///
/// 环境组装与 PTY 通道同源（cli::launch_env::assemble），凭据经环境变量注入
/// 子进程，不落盘、不经 IPC 传明文。
#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri 命令参数由 IPC schema 决定，无法拆分
pub async fn agent_session_start(
    app: tauri::AppHandle,
    manager: tauri::State<'_, Arc<AgentManager>>,
    db: tauri::State<'_, AppDatabase>,
    session_id: String,
    work_dir: String,
    profile_id: Option<String>,
    llm_provider_id: Option<String>,
    model_name: Option<String>,
    user_env_vars: Option<HashMap<String, String>>,
    cli_args: Option<String>,
    cli_session_id: Option<String>,
    claude_models: Option<String>,
) -> Result<(), String> {
    let tool_type = ToolType::Claude;
    let launch = crate::cli::launch_env::assemble(
        &db,
        &tool_type,
        profile_id.as_deref(),
        llm_provider_id.as_deref(),
        model_name.as_deref(),
        user_env_vars,
        claude_models.as_deref(),
    )?;

    // 与 PTY 通道同款 Claude settings env 清理（两通道注入同源，冲突面一致）
    if let Err(e) = crate::commands::claude_settings::clean_claude_settings_env(
        launch.claude_app_data_root.as_deref(),
    ) {
        eprintln!("清理 Claude Code settings.json 失败: {}", e);
    }

    // 参数组装与 pty::start_session 的 Claude 分支同规则：
    // cli_args JSON → Vec<String>；--model 追加（用户未显式传时）；
    // --session-id 注入（新建时；恢复会话 cli_args 已带 --resume 则不注入）
    let mut args: Vec<String> = match cli_args {
        Some(ref json) => serde_json::from_str(json).unwrap_or_default(),
        None => vec![],
    };
    if llm_provider_id.is_some() {
        if let Some(ref m) = model_name {
            if !m.is_empty() && !args.iter().any(|a| a == "--model") {
                args.push("--model".to_string());
                args.push(m.clone());
            }
        }
    }
    if let Some(ref sid) = cli_session_id {
        let has_session_id = args.iter().any(|a| a == "--session-id");
        let has_resume = args.iter().any(|a| a == "--resume" || a == "-r");
        if !has_session_id && !has_resume {
            args.push("--session-id".to_string());
            args.push(sid.clone());
        }
    }

    // 同会话重复 start：旧进程存活则拒绝（聊天通道无双开语义，误调直接报错）
    if manager.exists(&session_id) {
        return Err(format!("智能体会话 {session_id} 已在运行"));
    }

    let manager_arc: Arc<AgentManager> = manager.inner().clone();
    start_claude(
        app,
        manager_arc,
        ClaudeStartParams {
            session_id,
            work_dir,
            env_vars: launch.vars,
            extra_args: args,
        },
    )
    .await
    .map_err(|e| e.to_string())
}

/// 发送用户消息（写 stream-json 输入流）。
#[tauri::command]
pub async fn agent_send(
    manager: tauri::State<'_, Arc<AgentManager>>,
    session_id: String,
    text: String,
) -> Result<(), String> {
    manager
        .driver(&session_id)
        .map_err(|e| e.to_string())?
        .send(&text)
        .await
        .map_err(|e| e.to_string())
}

/// 请求中断当前生成（协议层 interrupt，进程与上下文保留）。
#[tauri::command]
pub async fn agent_interrupt(
    manager: tauri::State<'_, Arc<AgentManager>>,
    session_id: String,
) -> Result<(), String> {
    manager
        .driver(&session_id)
        .map_err(|e| e.to_string())?
        .interrupt()
        .await
        .map_err(|e| e.to_string())
}

/// 停止智能体会话（杀子进程并清表）。
#[tauri::command]
pub async fn agent_session_stop(
    manager: tauri::State<'_, Arc<AgentManager>>,
    session_id: String,
) -> Result<(), String> {
    manager.stop(&session_id).await.map_err(|e| e.to_string())
}

/// 应答权限询问（control_response 回写：allow/deny）。
#[tauri::command]
pub async fn agent_respond_permission(
    manager: tauri::State<'_, Arc<AgentManager>>,
    session_id: String,
    request_id: String,
    allow: bool,
) -> Result<(), String> {
    manager
        .driver(&session_id)
        .map_err(|e| e.to_string())?
        .respond_permission(&request_id, allow)
        .await
        .map_err(|e| e.to_string())
}

/// 应答智能体提问（tool_result 回写，终结 AskUserQuestion）。
#[tauri::command]
pub async fn agent_answer_question(
    manager: tauri::State<'_, Arc<AgentManager>>,
    session_id: String,
    tool_use_id: String,
    text: String,
) -> Result<(), String> {
    manager
        .driver(&session_id)
        .map_err(|e| e.to_string())?
        .answer_question(&tool_use_id, &text)
        .await
        .map_err(|e| e.to_string())
}
