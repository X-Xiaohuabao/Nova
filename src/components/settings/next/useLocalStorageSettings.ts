/**
 * localStorage 偏好设置 hook（Network/Notification/McpAccess 等页共用）。
 *
 * 读写立即反映到 state；持久化防抖 400ms 静默写（旧实现每按键弹保存提示，
 * 新策略不打扰，语义不变：本地即时可读）。
 */

import { useEffect, useRef, useState } from "react";

const SAVE_DEBOUNCE_MS = 400;

export function useLocalStorageSettings<T extends object>(
  storageKey: string,
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const [settings, setSettings] = useState<T>(defaults);
  const saveTimerRef = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // 首次挂载载入持久化值
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        setSettings({ ...defaults, ...(JSON.parse(raw) as Partial<T>) });
      }
    } catch {
      // 损坏值按默认处理
    }
    // defaults 为调用方常量
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // 卸载时冲刷未落盘的防抖保存
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        try {
          localStorage.setItem(storageKey, JSON.stringify(settingsRef.current));
        } catch {
          // 写失败不阻塞卸载
        }
      }
    };
  }, [storageKey]);

  const update = (patch: Partial<T>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // 写失败静默（内存态已更新）
        }
      }, SAVE_DEBOUNCE_MS);
      return next;
    });
  };

  return [settings, update];
}
