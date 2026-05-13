"use client";

/**
 * RetainerActions — client wrapper for the destructive lifecycle action
 * (`closeRetainerAction`). Renders nothing for non-active retainers so the
 * close button doesn't ghost on already-closed agreements.
 *
 * Uses `useTransition` to keep the page responsive during the round-trip;
 * `confirm()` gates the call so a slip of the keyboard doesn't close a
 * live retainer.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  closeRetainerAction,
  type RetainerActionResult,
} from "@/app/(workspace)/retainers/actions";
import type { RetainerStatus } from "@/lib/types";

interface Props {
  retainerId: string;
  status: RetainerStatus;
}

export function RetainerActions({ retainerId, status }: Props) {
  const t = useTranslations("retainers");
  const tError = useTranslations("error");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (status !== "active") {
    return null;
  }

  function onClose() {
    if (!confirm(t("closeConfirm"))) return;
    startTransition(async () => {
      const res: RetainerActionResult = await closeRetainerAction(retainerId);
      if ("ok" in res && res.ok) {
        router.refresh();
        return;
      }
      // Surface a minimal browser alert for the demo path — the (workspace)
      // shell does not have a toast component yet (Phase 4 scope).
      window.alert(tError("generic"));
    });
  }

  return (
    <button
      type="button"
      onClick={onClose}
      disabled={isPending}
      className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
      style={{
        background: "var(--kill)",
        color: "var(--bg)",
      }}
    >
      {t("close")}
    </button>
  );
}
