//! 斜杠命令源：聊天输入 `/` 面板的数据后端。
//!
//! CLI 不提供命令枚举接口（headless 下内置命令也不生效），Nova 自建命令源：
//! - 自定义命令（`~/.claude/commands`、`<workDir>/.claude/commands` 的 md 文件）
//!   与 Skills（`skills/*/SKILL.md`）从文件系统枚举——与用户实际命令集始终一致；
//! - 内置命令由 Nova 语义表实现（本地动作 / prompt 展开），不追求全量镜像 CLI。
//!
//! 命令文件格式（与 Claude Code 约定一致）：文件名即命令名；可选 frontmatter
//! 携带 description；正文为 prompt 模板（`$ARGUMENTS` 占位由前端展开）。

use std::path::{Path, PathBuf};

use serde::Serialize;

/// 命令来源（面板分组依据）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SlashCommandSource {
    /// Nova 本地实现的内置命令（/clear /model 等，动作在前端）
    BuiltinNova,
    /// Nova 内置 prompt 模板型命令（/init /review 等，展开即发送）
    BuiltinPrompt,
    /// 项目级自定义命令（<workDir>/.claude/commands）
    Project,
    /// 用户级自定义命令（~/.claude/commands）
    User,
    /// Skills（SKILL.md 的 name/description）
    Skill,
}

/// 面板命令条目。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SlashCommand {
    /// 命令名（不带 `/`）
    pub name: String,
    /// 面板描述行
    pub description: Option<String>,
    pub source: SlashCommandSource,
    /// prompt 模板（自定义命令/Skills/prompt 型内置）；本地动作型为 None
    pub prompt: Option<String>,
}

/// Nova 内置命令注册表（本地动作型：执行逻辑在前端 ChatView/appStore）。
fn builtin_nova() -> Vec<SlashCommand> {
    [
        ("clear", "清空对话上下文（保留界面历史，开启全新会话）"),
        ("model", "切换模型（选择后以新模型重启智能体通道）"),
        ("help", "查看 Nova 聊天支持的能力与快捷键"),
    ]
    .iter()
    .map(|&(name, description)| SlashCommand {
        name: name.to_string(),
        description: Some(description.to_string()),
        source: SlashCommandSource::BuiltinNova,
        prompt: None,
    })
    .collect()
}

/// 枚举全部命令源：项目/用户自定义命令 + Skills + Nova 内置。
///
/// 任何目录缺失或读取失败都按空集处理（命令面板是增强能力，不因文件系统
/// 异常阻塞聊天）。同名命令按「项目 > 用户 > 技能 > 内置」就近覆盖
/// （与 CLI 的项目级覆盖用户级行为一致），内置仅作同名兜底之外的基本盘。
pub fn list_commands(work_dir: &str) -> Vec<SlashCommand> {
    let work_dir = expand_home(work_dir);
    let mut commands = Vec::new();
    collect_command_files(
        &work_dir.join(".claude").join("commands"),
        SlashCommandSource::Project,
        &mut commands,
    );
    collect_command_files(&user_commands_dir(), SlashCommandSource::User, &mut commands);
    collect_skills(&work_dir.join(".claude").join("skills"), &mut commands);
    collect_skills(&user_skills_dir(), &mut commands);
    commands.extend(builtin_nova());
    dedup_by_name(commands)
}

/// 展开工作目录中的 `~`（Windows 下不是合法路径）。
fn expand_home(work_dir: &str) -> PathBuf {
    if work_dir == "~" || work_dir.is_empty() {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(work_dir)
    }
}

fn user_commands_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("commands")
}

fn user_skills_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("skills")
}

/// 解析单个命令 md：文件名（去扩展名）为命令名，frontmatter 取 description，
/// 正文（去 frontmatter）为 prompt 模板。解析失败返回 None（跳过该文件）。
fn parse_command_md(path: &Path, source: SlashCommandSource) -> Option<SlashCommand> {
    let raw = std::fs::read_to_string(path).ok()?;
    let name = path.file_stem()?.to_str()?.to_string();
    if name.is_empty() {
        return None;
    }
    let (description, prompt) = split_frontmatter(&raw);
    Some(SlashCommand {
        name,
        description,
        source,
        prompt: Some(prompt),
    })
}

/// 拆出 frontmatter 的 description 与正文 prompt。
///
/// frontmatter 约定为首行 `---` 到下一个 `---`；description 行支持 YAML 单行
/// 形态（`description: xxx`）。frontmatter 之外的其余字段（allowed-tools 等）
/// 不在本期面板的展示范围，随正文一并丢弃（不影响 prompt 语义）。
fn split_frontmatter(raw: &str) -> (Option<String>, String) {
    let trimmed = raw.trim_start();
    if let Some(rest) = trimmed.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let header = &rest[..end];
            let body = &rest[end + "\n---".len()..];
            let description = header.lines().find_map(|line| {
                let value = line.trim().strip_prefix("description:")?;
                let value = value.trim().trim_matches('"').trim_matches('\'');
                Some(value.to_string()).filter(|v| !v.is_empty())
            });
            return (description, body.trim_start().to_string());
        }
    }
    (None, raw.trim().to_string())
}

fn collect_command_files(dir: &Path, source: SlashCommandSource, out: &mut Vec<SlashCommand>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let mut paths: Vec<PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|ext| ext == "md"))
        .collect();
    paths.sort();
    for path in paths {
        if let Some(cmd) = parse_command_md(&path, source) {
            out.push(cmd);
        }
    }
}

/// Skills 目录：每个子目录一个 SKILL.md，frontmatter 的 name/description 即面板项。
/// 选中后以「使用 <name> 技能：<description>」形态展开为 prompt（SKILL 正文由
/// CLI 侧技能机制按需加载，Nova 不内联整个技能文件，避免撑爆首条消息）。
fn collect_skills(dir: &Path, out: &mut Vec<SlashCommand>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    let mut dirs: Vec<PathBuf> = entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    for skill_dir in dirs {
        let skill_md = skill_dir.join("SKILL.md");
        let raw = match std::fs::read_to_string(&skill_md) {
            Ok(raw) => raw,
            Err(_) => continue,
        };
        let (name, description) = parse_skill_frontmatter(&raw, &skill_dir);
        out.push(SlashCommand {
            name,
            description,
            source: SlashCommandSource::Skill,
            prompt: None,
        });
    }
}

/// SKILL.md frontmatter 解析：name 缺失时回退目录名；description 可选。
fn parse_skill_frontmatter(raw: &str, skill_dir: &Path) -> (String, Option<String>) {
    let fallback = skill_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("skill")
        .to_string();
    let trimmed = raw.trim_start();
    if let Some(rest) = trimmed.strip_prefix("---") {
        if let Some(end) = rest.find("\n---") {
            let header = &rest[..end];
            let name = header
                .lines()
                .find_map(|l| l.trim().strip_prefix("name:").map(|v| v.trim().to_string()))
                .filter(|v| !v.is_empty())
                .unwrap_or(fallback);
            let description = header.lines().find_map(|line| {
                let value = line.trim().strip_prefix("description:")?;
                let value = value.trim().trim_matches('"').trim_matches('\'');
                Some(value.to_string()).filter(|v| !v.is_empty())
            });
            return (name, description);
        }
    }
    (fallback, None)
}

/// 同名去重：保留先入者（项目级先于用户级先于内置，与 CLI 就近覆盖一致）。
fn dedup_by_name(commands: Vec<SlashCommand>) -> Vec<SlashCommand> {
    let mut seen = std::collections::HashSet::new();
    commands
        .into_iter()
        .filter(|c| seen.insert(c.name.clone()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// frontmatter 拆分：description 提取 + 正文剥离
    #[test]
    fn split_frontmatter_extracts_description() {
        let raw = "---\ndescription: 生成组件\nallowed-tools: Write\n---\n请生成 $ARGUMENTS";
        let (desc, prompt) = split_frontmatter(raw);
        assert_eq!(desc.as_deref(), Some("生成组件"));
        assert_eq!(prompt, "请生成 $ARGUMENTS");
    }

    /// 无 frontmatter：全文即 prompt，description 为空
    #[test]
    fn split_frontmatter_without_header() {
        let raw = "直接就是 prompt 内容";
        let (desc, prompt) = split_frontmatter(raw);
        assert!(desc.is_none());
        assert_eq!(prompt, raw);
    }

    /// 引号包裹的 description 值去引号
    #[test]
    fn split_frontmatter_strips_quotes() {
        let raw = "---\ndescription: \"带引号的描述\"\n---\nbody";
        let (desc, _) = split_frontmatter(raw);
        assert_eq!(desc.as_deref(), Some("带引号的描述"));
    }

    /// 同名去重保留先入者（自定义命令就近覆盖内置）
    #[test]
    fn dedup_keeps_first_occurrence() {
        let mut cmds = vec![SlashCommand {
            name: "clear".to_string(),
            description: Some("项目自定义版".to_string()),
            source: SlashCommandSource::Project,
            prompt: Some("覆盖".to_string()),
        }];
        cmds.extend(builtin_nova());
        let result = dedup_by_name(cmds);
        let clear = result.iter().find(|c| c.name == "clear").unwrap();
        assert_eq!(clear.source, SlashCommandSource::Project);
        assert_eq!(result.iter().filter(|c| c.name == "clear").count(), 1);
    }

    /// SKILL.md frontmatter：name 缺失回退目录名
    #[test]
    fn parse_skill_falls_back_to_dir_name() {
        let raw = "---\ndescription: 某技能\n---\n# 内容";
        let (name, desc) = parse_skill_frontmatter(raw, Path::new("/x/my-skill"));
        assert_eq!(name, "my-skill");
        assert_eq!(desc.as_deref(), Some("某技能"));
    }
}
