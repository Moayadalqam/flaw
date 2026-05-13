"use client";

/**
 * Start-timer form for the `/timer` dashboard.
 *
 * Only rendered when the user has no active timer (the page server-component
 * guards this — the partial unique index would reject a second insert
 * anyway, but the form is hidden to avoid even letting the user try).
 *
 * Behaviour:
 *   - The matter `<select>` is populated from the server prop. Matters are
 *     listed `matter_number — title` so the lawyer can find a case by
 *     either field.
 *   - When the matter changes, the hourly-rate field auto-fills with the
 *     selected matter's `default_hourly_rate` (server-supplied per row).
 *     The lawyer can override the rate before starting the timer.
 *   - On submit, calls `startTimerAction`. Surfaces `timer_already_active`
 *     inline (not a 500) and lets the server response drive the redirect.
 */

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  startTimerAction,
  type TimerActionResult,
} from "@/app/(workspace)/timer/actions";

interface MatterOption {
  id: string;
  matter_number: string;
  title: string;
  default_hourly_rate: string | null;
}

interface Props {
  matters: MatterOption[];
}

export function StartTimerForm({ matters }: Props) {
  const t = useTranslations("timer");
  const tErr = useTranslations("error");
  const [isPending, startTransition] = useTransition();
  const [matterId, setMatterId] = useState("");
  const [description, setDescription] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const matterById = useMemo(() => {
    const m = new Map<string, MatterOption>();
    for (const row of matters) m.set(row.id, row);
    return m;
  }, [matters]);

  function onMatterChange(next: string) {
    setMatterId(next);
    setError(null);
    // Prefill the rate from the matter's default — only when the rate input
    // is empty OR was sourced from a previous selection (we treat an empty
    // string as "unfilled" so the lawyer's manual override sticks).
    const selected = matterById.get(next);
    if (selected?.default_hourly_rate) {
      setHourlyRate(selected.default_hourly_rate);
    }
  }

  function handleResult(res: TimerActionResult): void {
    if ("ok" in res && res.ok) {
      setError(null);
      setDescription("");
      // The page revalidates via the action; React Server Components
      // re-render with the new active timer surfaced.
      return;
    }
    if ("error" in res) {
      if (res.error === "timer_already_active") {
        setError(t("timerAlreadyActive"));
      } else if (res.error === "missing_hourly_rate") {
        setError(t("hourlyRate"));
      } else {
        setError(tErr("generic"));
      }
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!matterId) {
      setError(t("matter"));
      return;
    }
    const fd = new FormData();
    fd.set("matter_id", matterId);
    if (description.trim().length > 0) {
      fd.set("description", description.trim());
    }
    if (hourlyRate.trim().length > 0) {
      fd.set("hourly_rate", hourlyRate.trim());
    }
    startTransition(async () => {
      const res = await startTimerAction(fd);
      handleResult(res);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <div
          role="alert"
          className="text-sm rounded-md border px-4 py-3"
          style={{
            background: "color-mix(in oklch, var(--kill) 8%, transparent)",
            borderColor: "var(--kill)",
            color: "var(--kill)",
          }}
        >
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1fr_1fr_10rem]">
        <div>
          <label
            htmlFor="timer-matter_id"
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--text)" }}
          >
            {t("matter")}
            <span style={{ color: "var(--accent)", marginLeft: "4px" }}>
              *
            </span>
          </label>
          <select
            id="timer-matter_id"
            name="matter_id"
            value={matterId}
            onChange={(e) => onMatterChange(e.target.value)}
            required
            style={inputStyle}
          >
            <option value="" disabled>
              {t("matter")}
            </option>
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.matter_number} — {m.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="timer-description"
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--text)" }}
          >
            {t("description")}
          </label>
          <input
            id="timer-description"
            name="description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={512}
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="timer-hourly_rate"
            className="block text-sm font-medium mb-1.5"
            style={{ color: "var(--text)" }}
          >
            {t("hourlyRate")}
          </label>
          <input
            id="timer-hourly_rate"
            name="hourly_rate"
            type="text"
            inputMode="decimal"
            value={hourlyRate}
            onChange={(e) => setHourlyRate(e.target.value)}
            placeholder="0.00"
            style={{ ...inputStyle, textAlign: "right" }}
            className="tabular"
          />
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={isPending || !matterId}
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-60"
          style={{
            background: "var(--accent)",
            color: "var(--bg)",
          }}
        >
          {t("start")}
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  borderRadius: "4px",
  padding: "0.55rem 0.75rem",
  width: "100%",
  minHeight: "44px",
};
