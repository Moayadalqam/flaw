/**
 * In-process rolling-window rate limiter for the Resend adapter.
 *
 * Phase 6 ships a 10-per-60s ceiling so the Resend free-tier quota
 * (100/day) is never the first thing that breaks during a live pitch
 * bulk-send. Resend itself has a 2/sec burst limit on the free plan
 * (https://resend.com/docs/api-reference/rate-limit) — the 10/min window
 * is the operational soft-ceiling we surface to the user via the
 * `rate_limited` typed error.
 *
 * Pure module-scoped state. No I/O. Safe for unit testing — pass `now`
 * explicitly to assert behaviour across simulated timestamps. The array
 * is intentionally NOT exported; reset between processes (Vercel
 * serverless invocations get fresh memory anyway, and that is the right
 * default — bulk-sends complete inside a single request handler).
 */

const recent: number[] = [];

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

/**
 * Try to acquire a slot in the rolling window.
 *
 * @param now — current epoch ms; defaults to `Date.now()`. Pass explicitly
 *   from tests to deterministically drive the window without faking the
 *   global clock.
 * @returns true if a slot was acquired (caller should proceed with the
 *   send); false if the 10-per-minute ceiling has been hit (caller should
 *   surface `{ ok: false, error: 'rate_limited' }`).
 */
export function tryAcquire(now: number = Date.now()): boolean {
  // Evict entries older than the window. Single pass — the array is
  // small (≤10) and we shift from the head, so O(window-misses).
  while (recent.length > 0 && now - recent[0] > WINDOW_MS) {
    recent.shift();
  }

  if (recent.length >= MAX_PER_WINDOW) {
    return false;
  }

  recent.push(now);
  return true;
}
