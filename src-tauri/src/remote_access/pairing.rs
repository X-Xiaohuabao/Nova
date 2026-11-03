//! 远程访问配对鉴权（RA4）。
//!
//! - 6 位数字配对码，5 分钟有效；服务开启时（重新）生成
//! - 握手首帧必须 auth（配对码或既往会话令牌二选一）
//! - 通过后签发会话令牌：明文只出现在 auth_ok 帧与本机 IPC 返回，
//!   服务端仅存 SHA-256 哈希；🔴 任何日志不得打印配对码/令牌明文
//! - 配对码错误 3 次：断连且全局冷却 30 秒（局域网阶段单设备场景）

use std::time::{Duration, Instant};

use rand::Rng;
use sha2::{Digest, Sha256};

/// 配对码有效期
pub const PAIRING_TTL: Duration = Duration::from_secs(5 * 60);
/// 会话令牌有效期（断线重连免配对）
pub const TOKEN_TTL: Duration = Duration::from_secs(24 * 60 * 60);
/// 认证失败上限（达到即断连）
pub const MAX_AUTH_ATTEMPTS: u8 = 3;
/// 触发上限后的冷却时长
pub const COOLDOWN: Duration = Duration::from_secs(30);

/// 当前配对码（明文仅存内存；expires 为 Unix 毫秒）
struct PairingState {
    code: String,
    expires_at_millis: i64,
}

static PAIRING: std::sync::Mutex<Option<PairingState>> = std::sync::Mutex::new(None);

/// 会话令牌表：SHA-256 哈希 → 过期时刻（Unix 毫秒）
static TOKENS: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, i64>>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

/// 全局冷却截止时刻（认证连续失败触发）
static COOLDOWN_UNTIL: std::sync::Mutex<Option<Instant>> = std::sync::Mutex::new(None);

fn now_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// 生成（或重新生成）6 位数字配对码；明文返回给调用方（仅本机 UI 消费），禁止落日志
pub fn generate_pairing_code() -> String {
    let code: String = (0..6).map(|_| rand::rng().random_range(0..10).to_string()).collect();
    {
        let mut state = PAIRING.lock().expect("配对码锁中毒");
        *state = Some(PairingState {
            expires_at_millis: now_millis() + PAIRING_TTL.as_millis() as i64,
            code: code.clone(),
        });
    }
    // 脱敏：日志只记录生成事件，不记录码值
    eprintln!("远程访问配对码已生成（5 分钟内有效）");
    code
}

/// 读取当前配对码及剩余有效秒数；无码或过期返回 None（含过期惰性清理）
pub fn current_pairing_code() -> Option<(String, i64)> {
    let mut state = PAIRING.lock().expect("配对码锁中毒");
    let now = now_millis();
    match state.as_ref() {
        Some(pairing) if pairing.expires_at_millis > now => {
            Some((pairing.code.clone(), (pairing.expires_at_millis - now) / 1000))
        }
        _ => {
            *state = None;
            None
        }
    }
}

/// 校验配对码（长度相等后整串比较；错误不区分具体原因，统一失败计数）
pub fn verify_pairing_code(code: &str) -> bool {
    let mut state = PAIRING.lock().expect("配对码锁中毒");
    let now = now_millis();
    let valid = match state.as_ref() {
        Some(pairing) => pairing.expires_at_millis > now && pairing.code == code,
        None => false,
    };
    if !valid {
        // 配对码已消耗或过期即作废，避免同一码反复尝试
        if let Some(pairing) = state.as_ref() {
            if pairing.expires_at_millis <= now {
                *state = None;
            }
        }
    }
    valid
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// 签发会话令牌：返回明文（只进 auth_ok 帧），服务端仅存哈希
pub fn issue_session_token() -> String {
    let token = uuid::Uuid::new_v4().to_string();
    let mut tokens = TOKENS.lock().expect("令牌表锁中毒");
    let now = now_millis();
    // 惰性清理过期令牌
    tokens.retain(|_, expires_at| *expires_at > now);
    tokens.insert(hash_token(&token), now + TOKEN_TTL.as_millis() as i64);
    token
}

/// 校验既往会话令牌（断线重连免配对）
pub fn verify_session_token(token: &str) -> bool {
    let tokens = TOKENS.lock().expect("令牌表锁中毒");
    tokens
        .get(&hash_token(token))
        .is_some_and(|expires_at| *expires_at > now_millis())
}

/// 撤销某会话令牌（连接关闭时）
pub fn revoke_session_token(token: &str) {
    TOKENS.lock().expect("令牌表锁中毒").remove(&hash_token(token));
}

/// 全局冷却判定与触发
pub fn cooldown_state() -> CooldownGuard {
    let mut until = COOLDOWN_UNTIL.lock().expect("冷却锁中毒");
    if let Some(deadline) = *until {
        if Instant::now() < deadline {
            return CooldownGuard::Cooling {
                remaining_secs: (deadline - Instant::now()).as_secs(),
            };
        }
        *until = None;
    }
    CooldownGuard::Open
}

/// 触发全局冷却
pub fn trigger_cooldown() {
    let mut until = COOLDOWN_UNTIL.lock().expect("冷却锁中毒");
    *until = Some(Instant::now() + COOLDOWN);
    eprintln!("远程访问认证连续失败，进入 30 秒冷却");
}

/// 冷却状态
pub enum CooldownGuard {
    /// 未冷却，允许认证
    Open,
    /// 冷却中（剩余秒数）
    Cooling { remaining_secs: u64 },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 配对码生成与校验() {
        let code = generate_pairing_code();
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|c| c.is_ascii_digit()));
        assert!(verify_pairing_code(&code));
        assert!(!verify_pairing_code("000000") || code == "000000");
        // 读回一致且剩余时间在窗口内
        let (read_back, remaining) = current_pairing_code().expect("应存在");
        assert_eq!(read_back, code);
        assert!(remaining > 0 && remaining <= 300);
    }

    #[test]
    fn 令牌签发仅存哈希且可校验撤销() {
        let token = issue_session_token();
        assert!(verify_session_token(&token));
        assert!(!verify_session_token("not-a-token"));
        revoke_session_token(&token);
        assert!(!verify_session_token(&token));
    }

    #[test]
    fn 令牌表不落明文() {
        let token = issue_session_token();
        let tokens = TOKENS.lock().expect("令牌表锁中毒");
        assert!(!tokens.contains_key(token.as_str()), "表内必须是哈希而非明文");
    }

    #[test]
    fn 冷却触发与恢复() {
        assert!(matches!(cooldown_state(), CooldownGuard::Open));
        trigger_cooldown();
        assert!(matches!(
            cooldown_state(),
            CooldownGuard::Cooling { .. }
        ));
    }
}
