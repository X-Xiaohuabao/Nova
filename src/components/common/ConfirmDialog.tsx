/**
 * 全局唯一确认交互（方案锁定：AlertDialog；M5-S4 统一各处重复实现）。
 *
 * 两种用法：
 * - 内联触发：传 `trigger` 节点（原 AlertDialogTrigger asChild 模式，逐行删除等）
 * - 受控：传 `open`/`onOpenChange`（状态驱动的待确认目标，如侧栏树/文件面板）
 *
 * `destructive`（默认 false）时确认钮红色，用于删除/清空等不可逆操作。
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogProps {
  title: ReactNode;
  description?: ReactNode;
  /** 内联触发节点（与 open/onOpenChange 二选一） */
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onConfirm?: () => void;
  /** 确认钮文案，默认 t("common.confirm") */
  confirmLabel?: string;
  /** 不可逆操作（删除/清空），确认钮红色 */
  destructive?: boolean;
}

export default function ConfirmDialog({
  title,
  description,
  trigger,
  open,
  onOpenChange,
  onConfirm,
  confirmLabel,
  destructive = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger != null && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description != null && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={onConfirm}
          >
            {confirmLabel ?? t("common.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
