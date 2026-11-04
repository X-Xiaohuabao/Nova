//! CLI 子进程启动环境组装（PTY 通道与 agent 聊天通道共用）。
//!
//! 组装顺序（后者覆盖前者）：
//! Profile 数据隔离 env → Keychain 凭据 → LLM Provider 注入 → compose_env 合并
//! user_env_vars → Claude 模型 tier 映射（保持 TeaCoder 权威性，不被 user_env 覆盖）。
//! 任何一条通道（PTY / agent stream-json）启动 CLI 前都应经由此处组装，
//! 禁止在命令层复制粘贴注入逻辑（两通道凭据行为必须同源）。

use std::collections::HashMap;

use crate::cli::ToolType;
use crate::crypto::keychain;
use crate::llm_provider::env_inject::EnvInjection;
use crate::profile;
use crate::storage::AppDatabase;

/// 组装结果：最终环境变量 + Claude settings 清理所需的 Profile 数据根。
pub struct LaunchEnv {
    pub vars: HashMap<String, String>,
    /// Profile 的应用数据根目录（Claude settings.json 清理时定位用；无 Profile 为 None）
    pub claude_app_data_root: Option<String>,
}

/// 组装 CLI 启动环境变量。
///
/// 参数语义与 commands::pty::start_session 的同名参数一致（前端两处传参也一致）。
pub fn assemble(
    db: &AppDatabase,
    tool_type: &ToolType,
    profile_id: Option<&str>,
    llm_provider_id: Option<&str>,
    model_name: Option<&str>,
    user_env_vars: Option<HashMap<String, String>>,
    claude_models: Option<&str>,
) -> Result<LaunchEnv, String> {
    let mut env_vars = HashMap::new();
    let mut provider_inj: Option<EnvInjection> = None;
    let mut claude_app_data_root: Option<String> = None;

    if let Some(pid) = profile_id {
        // Load profile for data isolation env vars
        let profiles = profile::list_profiles(db, None)?;
        if let Some(p) = profiles.iter().find(|p| p.id == pid) {
            claude_app_data_root = p.app_data_root.clone();
            if let Some(ref root) = p.app_data_root {
                match p.tool_type.as_str() {
                    "claude" => {
                        env_vars.insert("CLAUDE_CONFIG_DIR".to_string(), root.clone());
                    }
                    "codex" => {
                        env_vars.insert("CODEX_HOME".to_string(), root.clone());
                    }
                    "gemini" => {
                        env_vars.insert("GEMINI_HOME".to_string(), root.clone());
                    }
                    "opencode" => {
                        env_vars.insert("OPENCODE_HOME".to_string(), root.clone());
                    }
                    _ => {}
                }
            }

            // Inject API key from keychain as environment variable
            if p.auth_type == "api_key" {
                if let Ok(Some(api_key)) = keychain::get_secret(pid, "api_key") {
                    match p.tool_type.as_str() {
                        "claude" => {
                            env_vars.insert("ANTHROPIC_API_KEY".to_string(), api_key);
                        }
                        "codex" => {
                            env_vars.insert("OPENAI_API_KEY".to_string(), api_key);
                        }
                        "gemini" => {
                            env_vars.insert("GOOGLE_API_KEY".to_string(), api_key);
                        }
                        "opencode" => {
                            env_vars.insert("OPENCODE_API_KEY".to_string(), api_key);
                        }
                        _ => {}
                    }
                }
            }

            // Inject base URL if configured
            if let Some(ref url) = p.base_url {
                match p.tool_type.as_str() {
                    "claude" => {
                        env_vars.insert("ANTHROPIC_BASE_URL".to_string(), url.clone());
                    }
                    "codex" => {
                        env_vars.insert("OPENAI_BASE_URL".to_string(), url.clone());
                    }
                    _ => {}
                }
            }
        }
    }

    // LLM Provider 注入（Profile 之后、user_env_vars 之前）；
    // 强制要求：若 provider 需要凭证但缺失则报错，不静默忽略。
    // 不兼容组合（如 claude × openai）由 compute_injection 返回空注入，调用方不报错。
    if let Some(lpid) = llm_provider_id {
        if let Some(provider) = crate::llm_provider::get_provider(db, lpid)? {
            if !provider.is_active {
                return Err(format!(
                    "LLM 供应商「{}」已停用，请重新选择",
                    provider.name
                ));
            }

            let tool_str = match tool_type {
                ToolType::Claude => "claude",
                ToolType::Codex => "codex",
                ToolType::Gemini => "gemini",
                ToolType::OpenCode => "opencode",
                ToolType::Terminal | ToolType::Ssh => "",
            };

            let inj = crate::llm_provider::env_inject::compute_injection(
                tool_str,
                &provider.provider_kind,
                &provider.auth_type,
                provider.api_key.as_deref(),
                provider.oauth_token.as_deref(),
                provider.base_url.as_deref(),
                model_name,
            );

            // 凭证检查：compute_injection 在合法组合下返回 Some。
            // 此处校验凭证是否存在，缺失则报错（避免静默）。
            let has_credential = inj.api_key_var.is_some();
            if !has_credential && !tool_str.is_empty() {
                // tool 合法但凭证缺失：除 opencode 外，要求必须有凭证
                if !matches!(tool_type, ToolType::OpenCode) {
                    let cred_type = if provider.auth_type == "oauth" { "OAuth Token" } else { "API Key" };
                    return Err(format!(
                        "LLM 供应商「{}」未配置 {}",
                        provider.name, cred_type
                    ));
                }
            }

            // Provider 注入统一通过 compose_env 合并，避免在多处重复写入 env_vars。
            provider_inj = Some(inj);
        }
    }

    // 合并 Profile + LLM Provider + user_env_vars（后者覆盖前者）。
    let mut vars = crate::llm_provider::env_merge::compose_env(
        env_vars,
        provider_inj.unwrap_or_default(),
        user_env_vars.unwrap_or_default(),
    );

    // Claude Code 模型 tier 映射 → ANTHROPIC_DEFAULT_*_MODEL[_NAME] + ANTHROPIC_MODEL + CLAUDE_CODE_SUBAGENT_MODEL
    // 仅注入非空字段；user_env_vars 不覆盖此层（保持 TeaCoder 唯一权威性）。
    for (k, v) in crate::llm_provider::env_inject::compute_claude_tier_env(claude_models) {
        vars.insert(k, v);
    }

    Ok(LaunchEnv { vars, claude_app_data_root })
}
