/**
 * 新手引导（新骨架，H1 / T13）。
 *
 * 首启流程：用户协议（勾选确认，不可点遮罩/Esc 关闭）→ 三步功能引导
 * （LLM 供应商 → 项目 → 会话，进度条+点指示器）。localStorage 键与旧版一致
 * （nova_onboarding_completed / nova_agreement_accepted）。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  FolderPlus,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import ResponsiveDialog from "@/components/common/ResponsiveDialog";

const ONBOARDING_KEY = "nova_onboarding_completed";
const AGREEMENT_KEY = "nova_agreement_accepted";

export function useOnboarding() {
  const [showAgreement, setShowAgreement] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const agreed = localStorage.getItem(AGREEMENT_KEY);
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!agreed) {
      setShowAgreement(true);
    } else if (!completed) {
      setShowGuide(true);
    }
    setReady(true);
  }, []);

  const completeAgreement = () => {
    localStorage.setItem(AGREEMENT_KEY, "true");
    setShowAgreement(false);
    setShowGuide(true);
  };

  const completeGuide = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setShowGuide(false);
  };

  const skipGuide = () => {
    localStorage.setItem(ONBOARDING_KEY, "true");
    setShowGuide(false);
  };

  return { ready, showAgreement, showGuide, completeAgreement, completeGuide, skipGuide };
}

/** 协议弹窗（勾选前不可关闭：onOpenChange 忽略关闭意图） */
export function AgreementModalNext({ open, onAccept }: { open: boolean; onAccept: () => void }) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(false);

  const sections = [
    { titleKey: "onboarding.agree.licenseTitle", bodyKey: "onboarding.agree.licenseBody" },
    { titleKey: "onboarding.agree.dataTitle", bodyKey: "onboarding.agree.dataBody" },
    { titleKey: "onboarding.agree.disclaimerTitle", bodyKey: "onboarding.agree.disclaimerBody" },
    { titleKey: "onboarding.agree.privacyTitle", bodyKey: "onboarding.agree.privacyBody" },
  ];

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={() => {
        /* 协议态：遮罩点击/Esc 不关闭，必须勾选同意 */
      }}
      title={t("onboarding.agree.title")}
      size="md"
      footer={
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[13px] text-foreground/85">
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
              aria-label={t("onboarding.agree.checkbox")}
            />
            {t("onboarding.agree.checkbox")}
          </label>
          <Button disabled={!checked} onClick={onAccept}>
            {t("onboarding.agree.accept")}
          </Button>
        </div>
      }
    >
      <div className="max-h-72 space-y-3 overflow-y-auto pr-2 text-[13px] leading-relaxed">
        <h4 className="text-[15px] font-semibold">{t("onboarding.agree.heading")}</h4>
        <p className="m-0 text-muted-foreground">{t("onboarding.agree.intro")}</p>
        {sections.map((section) => (
          <div key={section.titleKey}>
            <h5 className="mb-1 mt-3 text-[13px] font-semibold">{t(section.titleKey)}</h5>
            <p className="m-0 text-muted-foreground">{t(section.bodyKey)}</p>
          </div>
        ))}
      </div>
    </ResponsiveDialog>
  );
}

interface GuideStep {
  titleKey: string;
  subtitleKey: string;
  icon: React.ReactNode;
  accent: string;
  accentSoft: string;
  descriptionKey: string;
  tips: { labelKey: string; valueKey: string }[];
}

/** 三步引导：橙(LLM) → 蓝(项目) → 紫(会话) */
const STEPS: GuideStep[] = [
  {
    titleKey: "onboarding.step1.title",
    subtitleKey: "onboarding.step1.subtitle",
    icon: <Cloud size={30} />,
    accent: "#fa8c16",
    accentSoft: "rgba(250, 140, 22, 0.10)",
    descriptionKey: "onboarding.step1.description",
    tips: [
      { labelKey: "onboarding.tip.entry", valueKey: "onboarding.step1.tipEntry" },
      { labelKey: "onboarding.tip.support", valueKey: "onboarding.step1.tipSupport" },
    ],
  },
  {
    titleKey: "onboarding.step2.title",
    subtitleKey: "onboarding.step2.subtitle",
    icon: <FolderPlus size={30} />,
    accent: "#3b82f6",
    accentSoft: "rgba(59, 130, 246, 0.10)",
    descriptionKey: "onboarding.step2.description",
    tips: [
      { labelKey: "onboarding.tip.entry", valueKey: "onboarding.step2.tipEntry" },
      { labelKey: "onboarding.tip.advice", valueKey: "onboarding.step2.tipAdvice" },
    ],
  },
  {
    titleKey: "onboarding.step3.title",
    subtitleKey: "onboarding.step3.subtitle",
    icon: <MessageSquare size={30} />,
    accent: "#722ed1",
    accentSoft: "rgba(114, 46, 209, 0.10)",
    descriptionKey: "onboarding.step3.description",
    tips: [
      { labelKey: "onboarding.tip.entry", valueKey: "onboarding.step3.tipEntry" },
      { labelKey: "onboarding.tip.required", valueKey: "onboarding.step3.tipRequired" },
    ],
  },
];

export function OnboardingGuideNext({
  open,
  onComplete,
  onSkip,
}: {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(0);

  const step = STEPS[current];
  const isFirst = current === 0;
  const isLast = current === STEPS.length - 1;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={() => {
        /* 引导态：不可点遮罩/Esc 关闭（走跳过/完成） */
      }}
      title={
        <span className="inline-flex items-center gap-2">
          <CheckCircle2 size={16} style={{ color: step.accent }} />
          {t("onboarding.welcome")}
        </span>
      }
      size="md"
      footer={
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onSkip}>
            {t("onboarding.skip")}
          </Button>
          <div className="flex gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={() => setCurrent(current - 1)}>
                <ArrowLeft size={14} />
                {t("onboarding.prev")}
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={onComplete}>
                {t("onboarding.start")}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setCurrent(current + 1)}>
                {t("onboarding.next")}
                <ArrowRight size={14} />
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* 顶部进度条 */}
      <div className="mb-5 flex gap-1.5">
        {STEPS.map((_, index) => (
          <div key={index} className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full transition-[width] duration-300"
              style={{
                width: index <= current ? "100%" : "0%",
                background: `linear-gradient(90deg, ${STEPS.slice(0, index + 1).map((st) => st.accent).join(", ")})`,
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col items-center px-2 text-center">
        <div className="mb-4 flex items-center gap-4">
          <div
            className="flex h-[72px] w-[72px] flex-shrink-0 items-center justify-center rounded-[20px] transition-colors"
            style={{ background: step.accentSoft, color: step.accent, boxShadow: `0 6px 16px -4px ${step.accentSoft}` }}
          >
            {step.icon}
          </div>
          <div className="min-w-0 text-left">
            <div className="text-base font-semibold">{t(step.titleKey)}</div>
            <div className="text-[13px] text-muted-foreground/80">{t(step.subtitleKey)}</div>
          </div>
        </div>
        <p className="mb-4 mt-0 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          {t(step.descriptionKey)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {step.tips.map((tip) => (
          <div key={tip.labelKey} className="rounded-md border border-border/70 px-3 py-2">
            <div className="mb-0.5 text-[11px] font-medium" style={{ color: step.accent }}>
              {t(tip.labelKey)}
            </div>
            <div className="text-xs leading-snug text-muted-foreground">{t(tip.valueKey)}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-center gap-1.5">
        {STEPS.map((s, index) => (
          <div
            key={index}
            className="rounded-full transition-all"
            style={{
              width: index === current ? 20 : 6,
              height: 6,
              backgroundColor: index === current ? s.accent : "var(--color-muted)",
            }}
          />
        ))}
      </div>
    </ResponsiveDialog>
  );
}
