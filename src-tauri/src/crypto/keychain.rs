use keyring::Entry;

use crate::storage::AppDatabase;

const SERVICE_NAME: &str = "com.xiaohuabao.nova";
const LEGACY_SERVICE_NAME: &str = "com.teacoder.app";

/// Store a secret in the system keychain for a given profile and key name.
/// Key names: "api_key", "oauth_token", "oauth_refresh_token".
pub fn store_secret(profile_id: &str, key_name: &str, value: &str) -> Result<(), String> {
    let entry = entry_for(profile_id, key_name)?;
    entry
        .set_password(value)
        .map_err(|e| format!("Failed to store {} in keychain: {}", key_name, e))
}

/// Retrieve a secret from the system keychain.
/// Returns None if the secret does not exist.
pub fn get_secret(profile_id: &str, key_name: &str) -> Result<Option<String>, String> {
    let entry = entry_for(profile_id, key_name)?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read {} from keychain: {}", key_name, e)),
    }
}

/// Delete a secret from the system keychain.
/// Returns Ok if the secret was deleted or did not exist.
pub fn delete_secret(profile_id: &str, key_name: &str) -> Result<(), String> {
    let entry = entry_for(profile_id, key_name)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete {} from keychain: {}", key_name, e)),
    }
}

/// Delete all stored secrets for a profile.
pub fn delete_all_secrets(profile_id: &str) -> Result<(), String> {
    for key_name in &["api_key", "oauth_token", "oauth_refresh_token"] {
        delete_secret(profile_id, key_name)?;
    }
    Ok(())
}

/// Check if a secret exists in the keychain.
pub fn get_secret_masked(profile_id: &str, key_name: &str) -> Result<Option<String>, String> {
    let secret = get_secret(profile_id, key_name)?;
    Ok(secret.map(|s| mask_secret(&s)))
}

/// Check if a secret exists in the keychain.
pub fn has_secret(profile_id: &str, key_name: &str) -> Result<bool, String> {
    let entry = entry_for(profile_id, key_name)?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(format!("Failed to check {} in keychain: {}", key_name, e)),
    }
}

/// Mask a secret for display (e.g., "***...abc1").
pub fn mask_secret(value: &str) -> String {
    if value.len() < 8 {
        "***".to_string()
    } else {
        format!("***...{}", &value[value.len() - 4..])
    }
}

fn entry_for(profile_id: &str, key_name: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, &account_for(profile_id, key_name))
        .map_err(|e| format!("Failed to create keychain entry: {}", e))
}

fn account_for(profile_id: &str, key_name: &str) -> String {
    format!("profile:{}:{}", profile_id, key_name)
}

/// 一次性把旧 service（com.teacoder.app）下的全部 Profile 凭据迁移到新 service。
/// 逐条"读到才搬"：旧条目存在且新条目为空时写入新条目、再删旧条目；
/// 单条失败仅记日志跳过（旧条目保留，下次启动重试），不阻断启动。凭据值不落日志。
pub fn migrate_legacy_service(db: &AppDatabase) {
    let profiles = match crate::profile::list_profiles(db, None) {
        Ok(profiles) => profiles,
        Err(e) => {
            eprintln!("keychain 迁移：读取 profile 列表失败: {e}");
            return;
        }
    };
    for profile in &profiles {
        for key_name in ["api_key", "oauth_token", "oauth_refresh_token"] {
            if let Err(e) = migrate_one_entry(&profile.id, key_name) {
                eprintln!("keychain 迁移跳过 profile {} 的 {key_name}: {e}", profile.id);
            }
        }
    }
}

fn migrate_one_entry(profile_id: &str, key_name: &str) -> Result<(), String> {
    let legacy = Entry::new(LEGACY_SERVICE_NAME, &account_for(profile_id, key_name))
        .map_err(|e| format!("Failed to create legacy keychain entry: {}", e))?;
    let value = match legacy.get_password() {
        Ok(value) => value,
        // 旧条目不存在说明已迁移过（或从未存过），无事可做
        Err(keyring::Error::NoEntry) => return Ok(()),
        Err(e) => return Err(format!("Failed to read legacy keychain entry: {}", e)),
    };
    let current = Entry::new(SERVICE_NAME, &account_for(profile_id, key_name))
        .map_err(|e| format!("Failed to create keychain entry: {}", e))?;
    match current.get_password() {
        // 新条目已有值，不覆盖，只清理旧条目
        Ok(_) => {}
        Err(keyring::Error::NoEntry) => {
            current
                .set_password(&value)
                .map_err(|e| format!("Failed to write migrated keychain entry: {}", e))?;
        }
        // 读新条目失败时不动旧条目，下次启动重试
        Err(e) => return Err(format!("Failed to check keychain entry: {}", e)),
    }
    match legacy.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete legacy keychain entry: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_secret_short() {
        assert_eq!(mask_secret("abc"), "***");
    }

    #[test]
    fn test_mask_secret_long() {
        assert_eq!(mask_secret("sk-ant-api03-longkey1234abc1"), "***...abc1");
    }

    #[test]
    fn test_mask_secret_exactly_8() {
        assert_eq!(mask_secret("12345678"), "***...5678");
    }
}
