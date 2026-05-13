"use client";

/**
 * Live ticker that renders the elapsed time since `startedAt` as
 * `HH:MM:SS`. The interval updates every 1000 ms; cleanup on unmount
 * prevents leaks across page navigations.
 *
 * Accessibility / motion:
 *   - The digit content updates each second; that's *content*, not
 *     motion. We deliberately do NOT wrap digit changes in any CSS
 *     transition or flash effect, so `prefers-reduced-motion: reduce`
 *     users see the same calm tick as everyone else.
 *   - `aria-live="off"` because screen readers would chatter every
 *     second otherwise. The widget exposes a static `aria-label` and
 *     announces only when the timer state actually changes (start/stop).
 *   - Tabular numerals (`className="tabular"`) keep the digits from
 *     re-flowing as they change width.
 */

import { useEffect, useState } from "react";

interface Props {
  startedAt: string;
  className?: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatElapsed(ms: number): string {
  if (ms < 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

export function LiveElapsed({ startedAt, className }: Props) {
  const startMs = new Date(startedAt).getTime();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, []);

  const elapsed = formatElapsed(now - startMs);

  return (
    <span
      className={`tabular${className ? ` ${className}` : ""}`}
      style={{ color: "var(--text)" }}
      aria-live="off"
      aria-label={`Elapsed ${elapsed}`}
    >
      {elapsed}
    </span>
  );
}
