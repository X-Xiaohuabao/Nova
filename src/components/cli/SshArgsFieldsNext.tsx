/**
 * SSH 连接参数字段组（新骨架，token 版）。
 *
 * 与旧 SshArgsFields 同契约（value/onChange/onTest/testing）；
 * 只拥有输入框与测试按钮，外层 section 样式归宿主弹窗。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import type { SshArgs } from "@/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface SshArgsFieldsNextProps {
  value: SshArgs;
  onChange: (next: SshArgs) => void;
  /** 测试连接需要走 IPC；不需要的宿主不传即隐藏按钮 */
  onTest?: () => void;
  testing?: boolean;
}

export default function SshArgsFieldsNext({ value, onChange, onTest, testing }: SshArgsFieldsNextProps) {
  const { t } = useTranslation();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const patch = (part: Partial<SshArgs>) => onChange({ ...value, ...part });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          className="h-7 flex-[2] text-xs"
          placeholder={t("sessions.ssh.hostname")}
          value={value.hostname}
          onChange={(e) => patch({ hostname: e.target.value })}
        />
        <Input
          className="h-7 flex-1 text-xs"
          placeholder={t("sessions.ssh.port")}
          type="number"
          value={value.port}
          onChange={(e) => patch({ port: Number.parseInt(e.target.value, 10) || 22 })}
        />
      </div>
      <Input
        className="h-7 text-xs"
        placeholder={t("sessions.ssh.username")}
        value={value.username}
        onChange={(e) => patch({ username: e.target.value })}
      />
      <div className="relative">
        <Input
          className="h-7 pr-8 text-xs"
          type={passwordVisible ? "text" : "password"}
          placeholder={t("sessions.ssh.password")}
          value={value.password}
          onChange={(e) => patch({ password: e.target.value })}
        />
        <button
          type="button"
          aria-label={t("sessions.ssh.togglePassword")}
          onClick={() => setPasswordVisible((v) => !v)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/70 hover:text-foreground"
        >
          {passwordVisible ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      </div>
      <Input
        className="h-7 text-xs"
        placeholder={t("sessions.ssh.identityFile")}
        value={value.identityFile}
        onChange={(e) => patch({ identityFile: e.target.value })}
      />
      {onTest && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={onTest} disabled={testing}>
            {testing ? t("sessions.ssh.testing") : t("sessions.ssh.test")}
          </Button>
        </div>
      )}
    </div>
  );
}
