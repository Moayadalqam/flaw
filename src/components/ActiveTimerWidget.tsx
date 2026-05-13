import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Square, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { TimeEntryWithRelations } from "@/lib/types";
import { LiveElapsed } from "@/app/(workspace)/timer/LiveElapsed";
import { stopTimerFormAction } from "@/app/(workspace)/timer/actions";

/**
 * Top-bar billable-hours widget.
 *
 * Server component. Fetches the current user's *active* timer (RLS-scoped,
 * partial unique index guarantees at most one row) and renders:
 *   - if a timer is running: matter number + live ticker + Stop button
 *     (the Stop button is a small square with `var(--accent)` background —
 *     terracotta because billable hours are revenue-track work);
 *   - otherwise: a discreet "Start timer →" link to /timer.
 *
 * The widget mounts globally in `<TopBar>`, so every page re-render also
 * re-renders the widget. `stopTimerAction` calls `revalidatePath("/")`
 * which propagates into this server component on the next render cycle.
 *
 * Tokens used here: --accent, --bg, --bg-2, --line, --muted. The sage-olive
 * tokens reserved for the trust ledger surface are deliberately absent —
 * billable hours are revenue work, not client funds.
 */
export async function ActiveTimerWidget() {
  const supabase = await createClient();
  const t = await getTranslations("timer");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data: activeData } = await supabase
    .from("time_entries")
    .select(
      "id, started_at, matter_id, matters!inner(matter_number, title, client_id)",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .returns<
      Pick<
        TimeEntryWithRelations,
        "id" | "started_at" | "matter_id" | "matters"
      >[]
    >();
  const active = activeData?.[0] ?? null;

  if (!active) {
    return (
      <Link
        href="/timer"
        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-md text-xs transition-colors hover:bg-[var(--bg-2)]"
        style={{ color: "var(--accent)" }}
      >
        <Timer size={14} strokeWidth={1.75} aria-hidden="true" />
        <span>{t("start")}</span>
      </Link>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-2 px-2 py-1 rounded-md border"
      style={{
        borderColor: "var(--line)",
        background: "var(--bg-2)",
      }}
    >
      <Link
        href="/timer"
        className="hidden md:inline text-xs tabular transition-colors hover:text-[var(--accent)]"
        style={{ color: "var(--muted)" }}
        title={active.matters?.title ?? undefined}
      >
        {active.matters?.matter_number ?? "\u2014"}
      </Link>
      <LiveElapsed
        startedAt={active.started_at}
        className="text-sm"
      />
      <form action={stopTimerFormAction.bind(null, active.id)}>
        <button
          type="submit"
          aria-label={t("stop")}
          className="inline-flex items-center justify-center rounded-md transition-colors min-h-[44px] min-w-[44px]"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
          }}
        >
          <Square size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
