//! 智能体统一聊天接入：结构化协议直连（不经 PTY）。
//!
//! 一阶段仅 Claude（stream-json 双向子进程）；Codex/Gemini/OpenCode 属二阶段。
//! 事件经 `agent:message` / `agent:state` 推送前端（见 doc/design-agent-chat.md §1）。

// T1 骨架提交：IPC 命令层（T2）接线前无外部调用方，框架期豁免 dead_code（同 cost 模块 v0.1.0 先例）
#![allow(dead_code)]

pub mod claude;

use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use thiserror::Error;
use tokio::sync::Mutex as AsyncMutex;

/// 智能体会话状态机（前端 design doc §7 消费同一份值）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentSessionState {
    /// 子进程启动中（尚未收到 system init）
    Starting,
    /// 模型生成中（收到 assistant 流 / 未收到 result）
    Thinking,
    /// 智能体停下等待用户决策（权限卡 / 问题卡）
    WaitingInput,
    /// 空闲，可继续对话
    Idle,
    /// 会话出错（进程崩溃 / 协议异常）
    Error,
}

/// 一轮对话的用量统计（result 消息携带；口径为 CLI 上报值，仅聊天内展示，
/// 状态栏权威数字仍走 cost 模块读 JSONL）。
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnUsage {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cache_creation_input_tokens: Option<u64>,
    pub cache_read_input_tokens: Option<u64>,
    pub cost_usd: Option<f64>,
}

/// Driver 归一事件模型：各 CLI 协议消息统一映射到本枚举后经 IPC 推送。
/// 字段统一 camelCase 序列化（与前端 TS 类型镜像对齐）。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum AgentEvent {
    /// 会话就绪（system init）：CLI 版本与 CLI 侧会话 id
    SessionReady {
        cli_version: Option<String>,
        claude_session_id: Option<String>,
    },
    /// 流式文本增量（打字机效果的输入源）
    MessageDelta { delta: String },
    /// 一条 assistant 文本块完成
    MessageComplete { text: String },
    /// 工具调用请求（assistant 消息的 tool_use 块）
    ToolUse {
        tool_use_id: String,
        name: String,
        input: serde_json::Value,
    },
    /// 工具执行结果（user 消息的 tool_result 块）
    ToolResult {
        tool_use_id: String,
        content: String,
        is_error: bool,
    },
    /// 权限询问（control_request / can_use_tool）——T5 完整接通应答
    PermissionRequest {
        request_id: String,
        tool_name: String,
        input: serde_json::Value,
    },
    /// 一轮结束（result 消息）
    TurnEnded {
        usage: TurnUsage,
        is_error: bool,
        duration_ms: Option<u64>,
    },
    /// 状态机变化
    StateChanged { state: AgentSessionState },
    /// 协议/运行错误
    Error { message: String },
    /// 子进程退出，会话结束
    SessionEnded { reason: Option<String> },
}

/// agent 领域错误。
#[derive(Debug, Error)]
pub enum AgentError {
    /// 会话不存在（未启动或已结束）
    #[error("智能体会话不存在: {0}")]
    SessionNotFound(String),
    /// 子进程启动失败（未安装 / 路径解析失败）
    #[error("启动智能体进程失败: {0}")]
    SpawnFailed(String),
    /// 写入 stdin 失败（管道已断，进程可能已退出）
    #[error("写入智能体进程失败: {0}")]
    WriteFailed(String),
    /// 协议消息组装失败
    #[error("协议消息错误: {0}")]
    Protocol(String),
}

/// 智能体驱动抽象：一家 CLI 一个实现。
///
/// 生命周期由 [`AgentManager`] 持有；实现内部自起读循环任务，
/// stdout 每一行归一为 [`AgentEvent`] 后经 tauri emit 推送前端。
#[async_trait::async_trait]
pub trait AgentDriver: Send + Sync {
    /// 发送一条用户消息（写协议输入流）。
    async fn send(&self, text: &str) -> Result<(), AgentError>;
    /// 请求中断当前生成（协议层 interrupt，非杀进程）。
    async fn interrupt(&self) -> Result<(), AgentError>;
    /// 返回当前状态机快照。
    fn state(&self) -> AgentSessionState;
}

/// Manager 表项：stdin 写端 + 进程句柄（kill 用）。
struct AgentEntry {
    driver: Arc<dyn AgentDriver>,
    child: AsyncMutex<tokio::process::Child>,
}

/// 智能体会话管理器（与 PtyManager 平行的独立通道，互不影响）。
pub struct AgentManager {
    sessions: std::sync::Mutex<HashMap<String, AgentEntry>>,
}

/// 事件推送 payload：sessionId + 归一事件。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEventPayload {
    pub session_id: String,
    pub event: AgentEvent,
}

/// 事件按语义分流到两个 IPC 事件名：
/// 消息语义 → `agent:message`；状态语义 → `agent:state`。
pub fn event_channel(event: &AgentEvent) -> &'static str {
    match event {
        AgentEvent::SessionReady { .. }
        | AgentEvent::StateChanged { .. }
        | AgentEvent::SessionEnded { .. } => "agent:state",
        _ => "agent:message",
    }
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            sessions: std::sync::Mutex::new(HashMap::new()),
        }
    }

    /// 注册一个已启动的会话（读循环由 Driver 实现内部持有）。
    pub fn register(
        &self,
        session_id: String,
        driver: Arc<dyn AgentDriver>,
        child: tokio::process::Child,
    ) {
        let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.insert(session_id, AgentEntry {
            driver,
            child: AsyncMutex::new(child),
        });
    }

    /// 取消注册（进程退出后清理表项）。
    pub fn unregister(&self, session_id: &str) {
        let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.remove(session_id);
    }

    /// 判断会话是否仍登记在表（前端恢复标签时用于探活）。
    pub fn exists(&self, session_id: &str) -> bool {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.contains_key(session_id)
    }

    /// 取会话驱动（发送 / 中断 / 状态查询共用）。
    pub fn driver(&self, session_id: &str) -> Result<Arc<dyn AgentDriver>, AgentError> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions
            .get(session_id)
            .map(|e| e.driver.clone())
            .ok_or_else(|| AgentError::SessionNotFound(session_id.to_string()))
    }

    /// 停止会话：杀子进程并清理表项。
    pub async fn stop(&self, session_id: &str) -> Result<(), AgentError> {
        let entry = {
            let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            sessions.remove(session_id)
        };
        if let Some(entry) = entry {
            let _ = entry.child.lock().await.kill().await;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 序列化契约：前端 TS 类型（src/types/agent.ts）按 camelCase 字段镜像，
    /// 字段名漂移会静默破坏 UI 解析，此处锁住关键事件的 JSON 形态。
    #[test]
    fn event_serialization_contract() {
        let payload = AgentEventPayload {
            session_id: "s-1".to_string(),
            event: AgentEvent::ToolUse {
                tool_use_id: "tu-1".to_string(),
                name: "Bash".to_string(),
                input: serde_json::json!({"command": "ls"}),
            },
        };
        let json = serde_json::to_string(&payload).expect("序列化不应失败");
        assert!(json.contains(r#""kind":"tool_use""#), "变体名 snake_case: {json}");
        assert!(json.contains(r#""toolUseId":"tu-1""#), "字段名 camelCase: {json}");
        assert!(json.contains(r#""sessionId":"s-1""#), "负载字段 camelCase: {json}");

        let state_payload = serde_json::to_string(&AgentEvent::StateChanged {
            state: AgentSessionState::WaitingInput,
        })
        .expect("序列化不应失败");
        assert!(
            state_payload.contains(r#""state":"waiting_input""#),
            "状态值 snake_case: {state_payload}"
        );
    }

    /// 事件分流：状态语义走 agent:state，其余走 agent:message
    #[test]
    fn event_channel_split() {
        assert_eq!(event_channel(&AgentEvent::SessionEnded { reason: None }), "agent:state");
        assert_eq!(
            event_channel(&AgentEvent::StateChanged { state: AgentSessionState::Idle }),
            "agent:state"
        );
        assert_eq!(event_channel(&AgentEvent::MessageDelta { delta: "x".into() }), "agent:message");
    }
}
