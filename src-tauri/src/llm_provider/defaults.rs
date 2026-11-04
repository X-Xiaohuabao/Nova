//! 新建会话默认值的三层解析（单一真相源）。
//!
//! 回退链：会话自身字段（已持久化，不在此处理）→ 项目默认（v17 四字段）
//! → 全局默认（`llm_providers.is_default` + 其默认模型）→ 兜底（第一个可用
//! 智能体工具 + 第一个兼容供应商）。
//!
//! 旧版"第一个同工具 Profile 的 tool_settings 偏好"暗规则随之废除——前端
//! 新建弹窗不再各自猜测默认值，统一走 [`resolve_session_defaults`]。
//!
//! 工具→供应商兼容表与前端 `TOOL_PROVIDER_KIND_MAP`、兜底工具顺序与前端
//! `CLI_TOOLS` 保持同步（antigravity 无供应商体系，不参与模型解析）。

use serde::{Deserialize, Serialize};

use crate::cli;
use crate::llm_provider::{self, LlmProvider};
use crate::project;
use crate::storage::AppDatabase;

/// 参与模型配置解析的智能体工具，顺序即兜底优先级（与前端 CLI_TOOLS 一致）。
const AGENT_TOOL_ORDER: [&str; 4] = ["claude", "codex", "gemini", "opencode"];

/// 工具 → 兼容的 provider_kind（与前端 TOOL_PROVIDER_KIND_MAP 对齐）。
fn compatible_kinds(tool: &str) -> &'static [&'static str] {
    match tool {
        "claude" => &["anthropic"],
        "codex" => &["openai"],
        "gemini" => &["google"],
        "opencode" => &["anthropic", "openai", "google", "custom"],
        _ => &[],
    }
}

/// ToolType 的字符串键（serde lowercase 序列化的人工镜像，避免运行时序列化）。
fn tool_type_key(t: &cli::ToolType) -> &'static str {
    match t {
        cli::ToolType::Claude => "claude",
        cli::ToolType::Codex => "codex",
        cli::ToolType::Gemini => "gemini",
        cli::ToolType::OpenCode => "opencode",
        cli::ToolType::Terminal => "terminal",
        cli::ToolType::Ssh => "ssh",
    }
}

/// 默认值来源层级，前端据此显示「项目默认 / 全局默认 / 兜底」。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DefaultsSource {
    /// 项目默认配置（v17 字段，至少一字段命中）
    Project,
    /// 全局默认供应商（llm_providers.is_default）
    Global,
    /// 无任何配置时的兜底
    Fallback,
}

/// 新建会话默认值的三层解析结果。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDefaults {
    pub tool_type: Option<String>,
    pub llm_provider_id: Option<String>,
    pub model_name: Option<String>,
    /// Claude 5 档映射 JSON，与 sessions.claude_models 同构
    pub claude_models: Option<String>,
    pub source: DefaultsSource,
}

/// 项目层默认配置（v17 四字段的内存形态）。
#[derive(Debug, Default, Clone)]
struct ProjectDefaults {
    tool_type: Option<String>,
    llm_provider_id: Option<String>,
    model_name: Option<String>,
    claude_models: Option<String>,
}

impl ProjectDefaults {
    fn any_set(&self) -> bool {
        self.tool_type.is_some()
            || self.llm_provider_id.is_some()
            || self.model_name.is_some()
            || self.claude_models.is_some()
    }
}

/// 解析新建会话的默认配置。
///
/// `project_id` 为 None（无项目上下文）时跳过项目层。
/// 供应商候选必须 `is_active` 且与解析出的工具兼容，否则逐级下落。
pub fn resolve_session_defaults(
    db: &AppDatabase,
    project_id: Option<&str>,
) -> Result<SessionDefaults, String> {
    let providers = llm_provider::list_providers(db, false)?;

    let available_tools: Vec<String> = cli::detector::detect_all()
        .into_iter()
        .filter(|t| t.is_available)
        .map(|t| tool_type_key(&t.tool_type).to_string())
        .collect();

    let project_defaults = match project_id {
        Some(pid) => {
            let projects = project::list_projects(db)?;
            projects.iter().find(|p| p.id == pid).map(|p| ProjectDefaults {
                tool_type: p.default_tool_type.clone(),
                llm_provider_id: p.default_llm_provider_id.clone(),
                model_name: p.default_model_name.clone(),
                claude_models: p.default_claude_models.clone(),
            })
        }
        None => None,
    }
    .unwrap_or_default();

    Ok(resolve_core(project_defaults, &providers, &available_tools))
}

/// 纯解析核心：不碰数据库与进程探测，输入输出均为纯数据，便于单测。
fn resolve_core(
    project: ProjectDefaults,
    providers: &[LlmProvider],
    available_tools: &[String],
) -> SessionDefaults {
    let global_default = providers.iter().find(|p| p.is_default);

    let source = if project.any_set() {
        DefaultsSource::Project
    } else if global_default.is_some() {
        DefaultsSource::Global
    } else {
        DefaultsSource::Fallback
    };

    // 工具：项目默认 → 与全局默认供应商兼容的第一个可用工具 → 第一个可用工具
    let agent_tools = || {
        available_tools
            .iter()
            .map(String::as_str)
            .filter(|t| AGENT_TOOL_ORDER.contains(t))
    };
    let tool = project
        .tool_type
        .clone()
        .filter(|t| AGENT_TOOL_ORDER.contains(&t.as_str()))
        .or_else(|| {
            let global_kind = global_default.map(|p| p.provider_kind.as_str());
            agent_tools()
                .find(|t| global_kind.is_none_or(|k| compatible_kinds(t).contains(&k)))
                .or_else(|| agent_tools().next())
                .map(str::to_string)
        });

    // 供应商：项目默认 → 全局默认 → 第一个兼容；均须 active 且与工具兼容
    let provider = tool.as_deref().and_then(|tool| {
        let kinds = compatible_kinds(tool);
        let candidates = [
            project.llm_provider_id.as_deref(),
            global_default.map(|p| p.id.as_str()),
        ];
        for candidate in candidates.into_iter().flatten() {
            if let Some(p) = providers.iter().find(|p| {
                p.id == candidate && p.is_active && kinds.contains(&p.provider_kind.as_str())
            }) {
                return Some(p);
            }
        }
        providers
            .iter()
            .find(|p| p.is_active && kinds.contains(&p.provider_kind.as_str()))
    });

    // 模型：项目默认 → 供应商默认模型（is_default 标记，缺省取排序第一个）
    let model = project
        .model_name
        .clone()
        .or_else(|| provider.and_then(provider_default_model));

    // Claude 5 档：项目默认 JSON 原样透传 → 未配置时从解析出的模型构建
    let claude_models = project.claude_models.clone().or_else(|| {
        if tool.as_deref() == Some("claude") {
            model.as_ref().map(|m| {
                format!("{{\"sonnet\":\"{m}\",\"opus\":\"{m}\",\"haiku\":\"{m}\",\"fable\":\"{m}\",\"subagent\":\"{m}\"}}")
            })
        } else {
            None
        }
    });

    SessionDefaults {
        tool_type: tool,
        llm_provider_id: provider.map(|p| p.id.clone()),
        model_name: model,
        claude_models,
        source,
    }
}

/// 供应商的默认模型：is_default 标记的模型，缺省取排序第一个。
fn provider_default_model(provider: &LlmProvider) -> Option<String> {
    let models = &provider.models;
    let chosen = models
        .iter()
        .find(|m| m.is_default)
        .or_else(|| models.first())?;
    Some(chosen.model_name.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm_provider::LlmProviderModel;

    fn model(provider_id: &str, name: &str, is_default: bool) -> LlmProviderModel {
        LlmProviderModel {
            id: format!("{provider_id}-{name}"),
            provider_id: provider_id.to_string(),
            model_name: name.to_string(),
            is_default,
            sort_order: 0,
            created_at: 0,
        }
    }

    fn provider(id: &str, kind: &str, is_default: bool, models: Vec<LlmProviderModel>) -> LlmProvider {
        LlmProvider {
            id: id.to_string(),
            name: id.to_string(),
            provider_kind: kind.to_string(),
            auth_type: "api_key".to_string(),
            base_url: None,
            icon: None,
            color: None,
            is_preset: false,
            is_active: true,
            is_default,
            created_at: 0,
            updated_at: 0,
            models,
            api_key: None,
            oauth_token: None,
        }
    }

    fn project(
        tool: Option<&str>,
        provider: Option<&str>,
        model: Option<&str>,
        claude: Option<&str>,
    ) -> ProjectDefaults {
        ProjectDefaults {
            tool_type: tool.map(str::to_string),
            llm_provider_id: provider.map(str::to_string),
            model_name: model.map(str::to_string),
            claude_models: claude.map(str::to_string),
        }
    }

    /// 项目层完整命中：工具/供应商/模型全取项目值，claude 档原样透传。
    #[test]
    fn project_layer_full_hit() {
        let providers = vec![provider("p1", "anthropic", false, vec![model("p1", "m-a", true)])];
        let result = resolve_core(
            project(Some("claude"), Some("p1"), Some("m-custom"), Some("{\"sonnet\":\"x\"}")),
            &providers,
            &["claude".to_string()],
        );
        assert_eq!(result.source, DefaultsSource::Project);
        assert_eq!(result.tool_type.as_deref(), Some("claude"));
        assert_eq!(result.llm_provider_id.as_deref(), Some("p1"));
        assert_eq!(result.model_name.as_deref(), Some("m-custom"));
        assert_eq!(result.claude_models.as_deref(), Some("{\"sonnet\":\"x\"}"));
    }

    /// 项目只配工具：供应商下落到全局默认（兼容时），模型取全局默认供应商的默认模型。
    #[test]
    fn project_tool_falls_through_to_global_provider() {
        let providers = vec![
            provider("g", "anthropic", true, vec![model("g", "g-default", true), model("g", "g-other", false)]),
            provider("o", "openai", false, vec![model("o", "o-m", true)]),
        ];
        let result = resolve_core(
            project(Some("claude"), None, None, None),
            &providers,
            &["claude".to_string()],
        );
        assert_eq!(result.source, DefaultsSource::Project);
        assert_eq!(result.tool_type.as_deref(), Some("claude"));
        assert_eq!(result.llm_provider_id.as_deref(), Some("g"));
        assert_eq!(result.model_name.as_deref(), Some("g-default"));
    }

    /// 全局默认与项目工具不兼容 → 取第一个兼容的 active 供应商。
    #[test]
    fn incompatible_global_falls_to_first_compatible() {
        let providers = vec![
            provider("g", "google", true, vec![model("g", "g-m", true)]),
            provider("a1", "anthropic", false, vec![model("a1", "a1-m", false), model("a1", "a1-def", true)]),
        ];
        let result = resolve_core(
            project(Some("claude"), None, None, None),
            &providers,
            &["claude".to_string()],
        );
        assert_eq!(result.llm_provider_id.as_deref(), Some("a1"));
        assert_eq!(result.model_name.as_deref(), Some("a1-def"));
    }

    /// 项目供应商失效（不存在）→ 全局默认兜上。
    #[test]
    fn stale_project_provider_falls_to_global() {
        let providers = vec![provider("g", "openai", true, vec![model("g", "g-m", true)])];
        let result = resolve_core(
            project(Some("codex"), Some("deleted-id"), None, None),
            &providers,
            &["codex".to_string()],
        );
        assert_eq!(result.llm_provider_id.as_deref(), Some("g"));
    }

    /// 无项目配置：全局层命中，工具取与全局供应商兼容的第一个可用工具。
    #[test]
    fn global_layer_prefers_compatible_tool() {
        let providers = vec![provider("g", "openai", true, vec![model("g", "g-m", true)])];
        // claude 可用但与 openai 供应商不兼容 → 应选 codex
        let result = resolve_core(
            ProjectDefaults::default(),
            &providers,
            &["claude".to_string(), "codex".to_string()],
        );
        assert_eq!(result.source, DefaultsSource::Global);
        assert_eq!(result.tool_type.as_deref(), Some("codex"));
        assert_eq!(result.llm_provider_id.as_deref(), Some("g"));
    }

    /// 全局供应商无兼容的可用工具：工具退到第一个可用工具，供应商按兼容性解析。
    #[test]
    fn global_kind_without_compatible_tool_falls_back() {
        let providers = vec![
            provider("g", "google", true, vec![model("g", "g-m", true)]),
            provider("a", "anthropic", false, vec![model("a", "a-m", true)]),
        ];
        // 只有 claude 可用，全局默认是 google 供应商
        let result = resolve_core(
            ProjectDefaults::default(),
            &providers,
            &["claude".to_string()],
        );
        assert_eq!(result.source, DefaultsSource::Global);
        assert_eq!(result.tool_type.as_deref(), Some("claude"));
        assert_eq!(result.llm_provider_id.as_deref(), Some("a"));
    }

    /// 无任何配置：兜底取第一个可用智能体工具，无供应商则模型为空。
    #[test]
    fn fallback_first_available_tool() {
        let result = resolve_core(
            ProjectDefaults::default(),
            &[],
            &["gemini".to_string(), "opencode".to_string()],
        );
        assert_eq!(result.source, DefaultsSource::Fallback);
        assert_eq!(result.tool_type.as_deref(), Some("gemini"));
        assert_eq!(result.llm_provider_id, None);
        assert_eq!(result.model_name, None);
    }

    /// claude 工具无项目 5 档配置时，从解析出的模型构建全档映射；非 claude 不生成。
    #[test]
    fn claude_tiers_built_from_resolved_model() {
        let providers = vec![provider("g", "anthropic", true, vec![model("g", "g-m", true)])];
        let result = resolve_core(
            ProjectDefaults::default(),
            &providers,
            &["claude".to_string()],
        );
        let parsed: serde_json::Value =
            serde_json::from_str(result.claude_models.as_deref().unwrap_or_default())
                .expect("claude_models 应为合法 JSON");
        assert_eq!(parsed["sonnet"], "g-m");
        assert_eq!(parsed["subagent"], "g-m");

        let result2 = resolve_core(
            project(Some("codex"), None, None, None),
            &providers,
            &["codex".to_string()],
        );
        assert_eq!(result2.claude_models, None);
    }

    /// 供应商模型无 is_default 标记时取排序第一个。
    #[test]
    fn provider_model_defaults_to_first() {
        let providers = vec![provider("p", "openai", true, vec![model("p", "first", false), model("p", "second", false)])];
        let result = resolve_core(
            ProjectDefaults::default(),
            &providers,
            &["codex".to_string()],
        );
        assert_eq!(result.model_name.as_deref(), Some("first"));
    }
}
