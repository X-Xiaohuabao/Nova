//! 远程访问 IPC 命令：配置读写与 WS 服务启停联动。
//! 凭据类命令永不入远程白名单（红线）。

use crate::remote_access;
use crate::remote_access::pairing;
use crate::storage::AppDatabase;

/// 配对码视图（本机 UI 展示用；明文仅经此命令给前台，日志不落码值）
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCodeView {
    pub code: String,
    /// 剩余有效秒数
    pub expires_in_secs: i64,
}

/// 读取远程访问配置（缺失键回落默认：关闭 + 默认端口）
#[tauri::command]
pub fn remote_get_config(
    db: tauri::State<AppDatabase>,
) -> Result<remote_access::RemoteAccessConfig, String> {
    remote_access::get_config(&db)
}

/// 写入远程访问配置，并联动 WS 服务启停/换端口重启（RA3）
#[tauri::command]
pub async fn remote_set_config(
    db: tauri::State<'_, AppDatabase>,
    config: remote_access::RemoteAccessConfig,
) -> Result<(), String> {
    remote_access::set_config(&db, &config)?;
    remote_access::server::sync(&config).await
}

/// 获取当前配对码；无有效码（过期/未生成）时现场生成新码（RA4）
#[tauri::command]
pub fn remote_get_pairing_code() -> Result<PairingCodeView, String> {
    let (code, expires_in_secs) = pairing::current_pairing_code().unwrap_or_else(|| {
        (
            pairing::generate_pairing_code(),
            pairing::PAIRING_TTL.as_secs() as i64,
        )
    });
    Ok(PairingCodeView { code, expires_in_secs })
}
