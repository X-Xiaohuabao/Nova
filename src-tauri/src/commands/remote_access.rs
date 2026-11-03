//! 远程访问 IPC 命令：配置读写。
//! 服务启停联动（RA3）将由 remote_set_config 驱动；凭据类命令永不入远程白名单。

use crate::remote_access;
use crate::storage::AppDatabase;

/// 读取远程访问配置（缺失键回落默认：关闭 + 默认端口）
#[tauri::command]
pub fn remote_get_config(
    db: tauri::State<AppDatabase>,
) -> Result<remote_access::RemoteAccessConfig, String> {
    remote_access::get_config(&db)
}

/// 写入远程访问配置；RA3 起此命令将联动 WS 服务的启动与停止
#[tauri::command]
pub fn remote_set_config(
    db: tauri::State<AppDatabase>,
    config: remote_access::RemoteAccessConfig,
) -> Result<(), String> {
    remote_access::set_config(&db, &config)
}
