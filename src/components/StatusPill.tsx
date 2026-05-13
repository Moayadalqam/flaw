import type { ReactNode } from "react";

/**
 * Status pill — caption-styled chip with one of four semantic tones.
 *
 * Tone → token mapping (per DESIGN.md §Tables / §Components):
 *   - `ok`    paid, open, healthy           → --ok
 *   - `warn`  due soon, on-hold             → --warn
 *   - `kill`  overdue, voided, error        → --kill
 *   - `muted` closed, archived, neutral     → --muted on --surface
 */

export type Tone = "ok" | "warn" | "kill" | "muted";

const TONE_STYLES: Record<
  Tone,
  { background: string; color: string }
> = {
  ok: {
    background: "oklch(0.55 0.130 150 / 0.12)",
    color: "var(--ok)",
  },
  warn: {
    background: "oklch(0.65 0.140 75 / 0.12)",
    color: "var(--warn)",
  },
  kill: {
    background: "oklch(0.52 0.180 25 / 0.12)",
    color: "var(--kill)",
  },
  muted: {
    background: "var(--surface)",
    color: "var(--muted)",
  },
};

export function StatusPill({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  const style = TONE_STYLES[tone];
  return (
    <span
      className="inline-flex items-center text-[0.7rem] uppercase font-medium"
      style={{
        background: style.background,
        color: style.color,
        padding: "2px 8px",
        borderRadius: "4px",
        letterSpacing: "0.08em",
        lineHeight: 1.4,
      }}
    >
      {children}
    </span>
  );
}
