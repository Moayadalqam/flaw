"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { Locale } from "@/i18n/routing";

export function LocaleToggle() {
  const locale = useLocale() as Locale;
  const t = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const next: Locale = locale === "el-CY" ? "en-CY" : "el-CY";
  const label =
    next === "en-CY" ? t("switchToEnglish") : t("switchToGreek");

  const onClick = () => {
    startTransition(async () => {
      const res = await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      if (res.ok) {
        router.refresh();
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-label={label}
      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-md text-sm border border-[var(--line)] bg-[var(--bg)] text-[var(--text)] hover:bg-[var(--bg-2)] transition-colors disabled:opacity-60"
    >
      {label}
    </button>
  );
}
