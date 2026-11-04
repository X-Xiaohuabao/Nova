use std::collections::HashMap;
use serde::Deserialize;

use crate::pty::manager::PtyManager;
use crate::pty::ToolType;
use crate::storage::AppDatabase;

#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri 命令参数由 IPC schema 决定，无法拆分
pub fn start_session(
    app: tauri::AppHandle,
    pty_manager: tauri::State<PtyManager>,
    db: tauri::State<AppDatabase>,
    tab_id: String,
    tool_type: ToolType,
    work_dir: String,
    profile_id: Option<String>,
    user_env_vars: Option<HashMap<String, String>>,
    cli_args: Option<String>,
    cli_session_id: Option<String>,
    llm_provider_id: Option<String>,
    model_name: Option<String>,
    claude_models: Option<String>,
) -> Result<(), String> {
    // 环境组装走共享模块（agent 聊天通道同源，凭据/隔离行为一致）
    let launch = crate::cli::launch_env::assemble(
        &db,
        &tool_type,
        profile_id.as_deref(),
        llm_provider_id.as_deref(),
        model_name.as_deref(),
        user_env_vars,
        claude_models.as_deref(),
    )?;
    let env_vars = launch.vars;

    // 启动 Claude Code 前清理 ~/.claude/settings.json 的 env 字段，
    // 避免用户在该文件里手动配置的环境变量与 TeaCoder 的注入冲突。
    // best-effort：失败不阻塞 PTY 启动。
    if matches!(tool_type, ToolType::Claude) {
        if let Err(e) =
            crate::commands::claude_settings::clean_claude_settings_env(launch.claude_app_data_root.as_deref())
        {
            eprintln!("清理 Claude Code settings.json 失败: {}", e);
        }
    }

    let mut args: Vec<String> = if matches!(tool_type, ToolType::Ssh) {
        // SSH 的 cli_args 是 JSON 对象(如 {"hostname":"...","port":22,...}),
        // 不能按 `Vec<String>` 反序列化(会失败并被 unwrap_or_default() 静默吞掉),
        // 交给 PtyManager 直接解析原始 JSON 字符串。
        Vec::new()
    } else if let Some(ref json) = cli_args {
        serde_json::from_str(json).unwrap_or_default()
    } else {
        vec![]
    };

    // LLM Provider model 参数追加（Claude/Codex/Gemini 通过 --model <name>）；
    // OpenCode 的 model 由其配置文件管理，不通过 --model 注入。
    // 仅在 args 尚未包含 --model 时追加，避免覆盖用户显式传值。
    if let Some(ref _lpid) = llm_provider_id {
        if let Some(ref m) = model_name {
            if !m.is_empty()
                && matches!(tool_type, ToolType::Claude | ToolType::Codex | ToolType::Gemini)
                && !args.iter().any(|a| a == "--model")
            {
                args.push("--model".to_string());
                args.push(m.clone());
            }
        }
    }

    // Claude Code: 新建会话时注入 --session-id，以便后续 --resume 精确恢复
    // 恢复会话时 cli_args 中已包含 --resume <id>，不需要再注入 --session-id
    if matches!(tool_type, ToolType::Claude) {
        if let Some(ref sid) = cli_session_id {
            let has_session_id = args.iter().any(|a| a == "--session-id");
            let has_resume = args.iter().any(|a| a == "--resume" || a == "-r");
            if !has_session_id && !has_resume {
                args.push("--session-id".to_string());
                args.push(sid.clone());
            }
        }
    }

    pty_manager.start_session(app.clone(), tab_id.clone(), tool_type.clone(), work_dir.clone(), env_vars, args, cli_args)?;

    Ok(())
}

#[tauri::command]
pub fn stop_session(
    pty_manager: tauri::State<PtyManager>,
    tab_id: String,
) -> Result<(), String> {
    pty_manager.stop_session(&tab_id)
}

#[tauri::command]
pub fn write_to_pty(
    pty_manager: tauri::State<PtyManager>,
    tab_id: String,
    data: String,
) -> Result<(), String> {
    pty_manager.write_to_pty(&tab_id, &data)
}

#[tauri::command]
pub fn resize_pty(
    pty_manager: tauri::State<PtyManager>,
    tab_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    pty_manager.resize_pty(&tab_id, cols, rows)
}

#[derive(Debug, Deserialize)]
pub struct SshTestParams {
    hostname: String,
    port: Option<u16>,
    username: Option<String>,
    password: Option<String>,
    identity_file: Option<String>,
}

#[tauri::command]
pub async fn test_ssh_connection(params: SshTestParams) -> Result<String, String> {
    use std::process::Command;

    let port = params.port.unwrap_or(22);
    let username = params.username.as_deref().unwrap_or("root");

    // 构建 ssh 命令进行连接测试
    let user_host = format!("{}@{}", username, params.hostname);

    let mut args = vec![
        user_host,
        "-p".to_string(),
        port.to_string(),
        "-o".to_string(),
        "BatchMode=yes".to_string(),
        "-o".to_string(),
        "ConnectTimeout=5".to_string(),
        "-o".to_string(),
        "StrictHostKeyChecking=no".to_string(),
    ];

    // 如果有身份文件，添加它
    if let Some(ref key_file) = params.identity_file {
        if !key_file.is_empty() {
            args.push("-i".to_string());
            args.push(key_file.clone());
            // 公钥认证优先
            args.push("-o".to_string());
            args.push("PreferredAuthentications=publickey".to_string());
        }
    } else if let Some(ref _pwd) = params.password {
        // 如果有密码但不提供身份文件，会话将提示输入密码
        args.push("-o".to_string());
        args.push("PreferredAuthentications=password".to_string());
    }

    let output = Command::new("ssh")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute ssh: {}", e))?;

    if output.status.success() {
        Ok("连接成功".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        // BatchMode 时如果需要密码会直接失败，这是预期的行为
        if stderr.contains("Permission denied") || stdout.contains("Permission denied") {
            Err("认证失败，请检查用户名、密码或密钥".to_string())
        } else if stderr.contains("Connection timed out") || stdout.contains("Connection timed out") {
            Err("连接超时，请检查主机地址和端口".to_string())
        } else if stderr.contains("No route to host") || stdout.contains("No route to host") {
            Err("无法到达主机，请检查网络连接".to_string())
        } else if stderr.contains("Connection refused") || stdout.contains("Connection refused") {
            Err("连接被拒绝，请检查端口是否正确".to_string())
        } else {
            Err(format!("连接失败: {}", if stderr.is_empty() { stdout.to_string() } else { stderr.to_string() }))
        }
    }
}
