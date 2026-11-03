//! 远程访问 WS 帧协议（权威定义：src/lib/bridge/types.ts）。
//!
//! 服务端只消费 invoke 帧、产出 result 帧；result / event 帧收到即忽略。
//! 序列化形状必须与前端保持逐字段一致（含 type 判别字段），由单测锁定。

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 客户端 ↔ 服务端双向帧
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum WsFrame {
    /// 手机端 → 本地：命令请求
    #[serde(rename = "invoke")]
    Invoke {
        /// 请求 id（uuid），用于匹配 result 帧
        id: String,
        /// 命令名，与 Tauri command 同名同参
        cmd: String,
        /// 命令参数；缺省按空对象处理
        #[serde(default)]
        args: Value,
    },
    /// 本地 → 手机端：命令结果
    #[serde(rename = "result")]
    Result {
        /// 对应请求 id
        id: String,
        /// 成功与否
        ok: bool,
        /// 成功时载荷；失败时不序列化（与 TS 联合类型两分支一致）
        #[serde(default, skip_serializing_if = "Value::is_null")]
        data: Value,
        /// 失败时错误信息；成功时不序列化
        #[serde(default, skip_serializing_if = "String::is_empty")]
        error: String,
    },
    /// 手机端 → 本地：事件单向推送（服务端收到即忽略）
    #[serde(rename = "event")]
    Event {
        /// 事件名，与 Tauri event 同名
        event: String,
        /// 事件负载
        payload: Value,
    },
    /// 手机端 → 本地：握手认证帧（RA4；首帧必须 auth，配对码或既往令牌二选一）
    #[serde(rename = "auth")]
    Auth {
        /// 6 位配对码
        #[serde(default)]
        code: String,
        /// 既往会话令牌（断线重连免配对）
        #[serde(default)]
        token: String,
    },
    /// 本地 → 手机端：认证通过（携带会话令牌，客户端须保存供重连）
    #[serde(rename = "auth_ok")]
    AuthOk {
        /// 会话令牌（明文仅出现在本帧，服务端只存哈希）
        token: String,
    },
    /// 本地 → 手机端：认证失败（未认证前其它帧一律拒绝）
    #[serde(rename = "auth_err")]
    AuthErr {
        /// 失败原因（不含配对码/令牌内容）
        error: String,
    },
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn invoke帧解析与前端形状一致() {
        let text = r#"{"type":"invoke","id":"u1","cmd":"remote_ping"}"#;
        let frame: WsFrame = serde_json::from_str(text).expect("解析失败");
        match frame {
            WsFrame::Invoke { id, cmd, args } => {
                assert_eq!(id, "u1");
                assert_eq!(cmd, "remote_ping");
                assert!(args.is_null());
            }
            _ => panic!("应解析为 invoke 帧"),
        }
    }

    #[test]
    fn result成功帧序列化无error字段() {
        let frame = WsFrame::Result {
            id: "u1".to_string(),
            ok: true,
            data: json!({ "pong": true }),
            error: String::new(),
        };
        let text = serde_json::to_string(&frame).expect("序列化失败");
        assert!(text.contains(r#""type":"result""#));
        assert!(text.contains(r#""ok":true"#));
        assert!(!text.contains("error"));
    }

    #[test]
    fn result失败帧序列化无data字段() {
        let frame = WsFrame::Result {
            id: "u2".to_string(),
            ok: false,
            data: Value::Null,
            error: "命令不在远程白名单".to_string(),
        };
        let text = serde_json::to_string(&frame).expect("序列化失败");
        assert!(text.contains(r#""ok":false"#));
        assert!(text.contains("error"));
        assert!(!text.contains("data"));
    }

    #[test]
    fn event帧往返一致() {
        let frame = WsFrame::Event {
            event: "cost:updated".to_string(),
            payload: json!({ "sessionId": "s1" }),
        };
        let text = serde_json::to_string(&frame).expect("序列化失败");
        let parsed: WsFrame = serde_json::from_str(&text).expect("回读失败");
        match parsed {
            WsFrame::Event { event, payload } => {
                assert_eq!(event, "cost:updated");
                assert_eq!(payload, json!({ "sessionId": "s1" }));
            }
            _ => panic!("应解析为 event 帧"),
        }
    }

    #[test]
    fn auth帧双向形状一致() {
        // 客户端 → 服务端：配对码认证
        let frame: WsFrame =
            serde_json::from_str(r#"{"type":"auth","code":"123456"}"#).expect("解析失败");
        assert!(matches!(frame, WsFrame::Auth { code, token } if code == "123456" && token.is_empty()));
        // 客户端 → 服务端：令牌重连
        let frame: WsFrame =
            serde_json::from_str(r#"{"type":"auth","token":"t-1"}"#).expect("解析失败");
        assert!(matches!(frame, WsFrame::Auth { code, token } if code.is_empty() && token == "t-1"));
        // 服务端 → 客户端：auth_ok / auth_err
        let ok = serde_json::to_string(&WsFrame::AuthOk { token: "t-2".to_string() }).expect("序列化失败");
        assert_eq!(ok, r#"{"type":"auth_ok","token":"t-2"}"#);
        let err = serde_json::to_string(&WsFrame::AuthErr { error: "配对码或令牌无效".to_string() })
            .expect("序列化失败");
        assert!(err.contains(r#""type":"auth_err""#));
    }
}
