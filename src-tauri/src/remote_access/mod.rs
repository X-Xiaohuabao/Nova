//! 远程访问：WS 服务配置与生命周期（局域网阶段）。
//!
//! 红线约束（AGENTS.md）：服务默认**关闭**；仅当用户显式开启后方可绑定
//! 非回环地址，且必须强制配对鉴权（RA4）；日志与导出脱敏。
//! 本文件（RA2 阶段）仅含配置持久化，配置存于 app_settings 键值表；
//! WS 服务本体由 RA3 交付，配对鉴权由 RA4 交付。

use crate::storage::AppDatabase;
use serde::{Deserialize, Serialize};

/// app_settings 键名前缀，避免与其他设置冲突
const KEY_ENABLED: &str = "remote_enabled";
const KEY_PORT: &str = "remote_port";

/// 默认端口：与未来内部网关（127.0.0.1:49999）区分
pub const DEFAULT_PORT: u16 = 47001;

/// 远程访问配置（前端字段 camelCase 映射）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteAccessConfig {
    /// 是否启用远程访问服务；默认 false（红线要求）
    pub enabled: bool,
    /// WS 监听端口
    pub port: u16,
}

impl Default for RemoteAccessConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            port: DEFAULT_PORT,
        }
    }
}

/// 读取配置；键缺失时回落默认值（关闭状态）
pub fn get_config(db: &AppDatabase) -> Result<RemoteAccessConfig, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let read_key = |key: &str| -> Option<String> {
        conn.query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            (key,),
            |row| row.get::<_, String>(0),
        )
        .ok()
    };

    let enabled = read_key(KEY_ENABLED).and_then(|v| v.parse().ok()).unwrap_or(false);
    let port = read_key(KEY_PORT)
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    Ok(RemoteAccessConfig { enabled, port })
}

/// 写入配置（enabled 与 port 一次事务内两键同写）
pub fn set_config(db: &AppDatabase, config: &RemoteAccessConfig) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();

    let tx = conn.transaction().map_err(|e| format!("开启事务失败: {e}"))?;
    for (key, value) in [
        (KEY_ENABLED, config.enabled.to_string()),
        (KEY_PORT, config.port.to_string()),
    ] {
        tx.execute(
            "INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)",
            (key, &value, &now),
        )
        .map_err(|e| format!("Failed to save remote access config: {e}"))?;
    }
    tx.commit().map_err(|e| format!("提交事务失败: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> AppDatabase {
        // 测试用内存库：手动建 app_settings 表，绕过 AppDatabase::new 的磁盘路径
        let conn = rusqlite::Connection::open_in_memory().expect("打开内存库失败");
        conn.execute_batch(
            "CREATE TABLE app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );",
        )
        .expect("建表失败");
        AppDatabase {
            conn: std::sync::Mutex::new(conn),
        }
    }

    #[test]
    fn 缺失键时返回默认关闭配置() {
        let db = test_db();
        let config = get_config(&db).expect("读取失败");
        assert!(!config.enabled);
        assert_eq!(config.port, DEFAULT_PORT);
    }

    #[test]
    fn 写入后读取一致且事务生效() {
        let db = test_db();
        let config = RemoteAccessConfig {
            enabled: true,
            port: 47123,
        };
        set_config(&db, &config).expect("写入失败");
        let loaded = get_config(&db).expect("读取失败");
        assert!(loaded.enabled);
        assert_eq!(loaded.port, 47123);
    }

    #[test]
    fn 覆写生效() {
        let db = test_db();
        set_config(&db, &RemoteAccessConfig { enabled: true, port: 1 }).expect("写入失败");
        set_config(&db, &RemoteAccessConfig { enabled: false, port: 2 }).expect("覆写失败");
        let loaded = get_config(&db).expect("读取失败");
        assert!(!loaded.enabled);
        assert_eq!(loaded.port, 2);
    }
}
