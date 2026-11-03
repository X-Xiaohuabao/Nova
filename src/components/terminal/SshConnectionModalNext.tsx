/**
 * Terminal 会话临时 SSH 连接弹窗（新骨架，F1 / T13）。
 *
 * 密码只活在本组件 state 里，关窗即清；调用方拿副本留在面板 state 上，
 * 不落库、不打日志（凭据红线）。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { testSshConnection } from "@/utils/ipc";
import type { SshArgs } from "@/types";
import { EMPTY_SSH_ARGS } from "@/utils/sshArgs";
import SshArgsFieldsNext from "@/components/cli/SshArgsFieldsNext";
import { Button } from "@/components/ui/button";
import ResponsiveDialog from "@/components/common/ResponsiveDialog";

interface SshConnectionModalNextProps {
  open: boolean;
  onClose: () => void;
  /** 确认后把参数交给调用方。调用方只在本次传输内存放，不落库。 */
  onConfirm: (args: SshArgs) => void;
}

export default function SshConnectionModalNext({ open, onClose, onConfirm }: SshConnectionModalNextProps) {
  const { t } = useTranslation();
  const [args, setArgs] = useState<SshArgs>(EMPTY_SSH_ARGS);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const close = () => {
    // 连同密码一起清掉：state 残留等于凭据在内存里多活一个弹窗周期
    setArgs(EMPTY_SSH_ARGS);
    setTestResult(null);
    onClose();
  };

  const handleTest = async () => {
    if (!args.hostname.trim()) {
      setTestResult({ ok: false, text: t("sessions.sshHostnameRequired") });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const msg = await testSshConnection({
        hostname: args.hostname.trim(),
        port: args.port,
        username: args.username.trim() || undefined,
        password: args.password || undefined,
        identity_file: args.identityFile.trim() || undefined,
      });
      setTestResult({ ok: true, text: msg });
    } catch (e) {
      setTestResult({ ok: false, text: typeof e === "string" ? e : t("sessions.sshTestFailed") });
    } finally {
      setTesting(false);
    }
  };

  const handleConfirm = () => {
    if (!args.hostname.trim()) {
      setTestResult({ ok: false, text: t("sessions.sshHostnameRequired") });
      return;
    }
    onConfirm({
      ...args,
      hostname: args.hostname.trim(),
      username: args.username.trim(),
      identityFile: args.identityFile.trim(),
    });
    close();
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={t("ssh.modalTitle")}
      description={t("ssh.modalHint")}
      size="sm"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={close}>{t("common.cancel")}</Button>
          <Button onClick={handleConfirm}>{t("ssh.startTransfer")}</Button>
        </div>
      }
    >
      <div className="py-1">
        <SshArgsFieldsNext value={args} onChange={setArgs} onTest={() => void handleTest()} testing={testing} />
        {testResult && (
          <div className="mt-2 text-xs" style={{ color: testResult.ok ? "var(--color-success)" : "var(--color-destructive)" }}>
            {testResult.text}
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}
