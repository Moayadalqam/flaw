"use client";

/**
 * AgingTable — client component owning the row-selection state for the
 * aging report (Phase 6 Task 4 / REQ-016 / REP-02).
 *
 * Layout: three `<details open>` accordion sections — one per bucket
 * (0-30, 31-60, 60+). Each section renders a checkbox-prefixed table.
 * The "Draft Reminders" toolbar button at the top is disabled until the
 * lawyer has selected ≥ 1 row; clicking it opens the modal with the
 * collected `OverdueInvoice` rows so the modal can read each row's
 * recipient email + language without re-fetching.
 *
 * Visual styling mirrors the `Table` primitive in `@/components/Table.tsx`:
 * sticky header on --bg-2, caption-styled column labels, hover-row
 * background on --surface, --line-soft row separators. We do not use the
 * Table primitive itself because it doesn't accept a checkbox column or
 * a per-bucket footer-total row.
 *
 * Status pills are reused from `@/components/StatusPill.tsx`: 31-60 →
 * `kind="warn"`, 60+ → `kind="kill"`. 0-30 has no pill (in-bucket
 * highlighting only).
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { formatMoney, type LexLocale } from "@/lib/format";
import type { AgingBucket, OverdueInvoice } from "./queries";
import { DraftReminderModal } from "./DraftReminderModal";

const BUCKETS: AgingBucket[] = ["0-30", "31-60", "60+"];

const BUCKET_TONE: Record<AgingBucket, Tone | null> = {
  "0-30": null,
  "31-60": "warn",
  "60+": "kill",
};

export function AgingTable({
  rows,
  locale,
}: {
  rows: OverdueInvoice[];
  locale: LexLocale;
}) {
  const t = useTranslations("aging");
  const isGreek = locale === "el-CY";

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);

  // Group rows by bucket once per render — derived state, no useEffect
  // needed.
  const byBucket = useMemo(() => {
    const m: Record<AgingBucket, OverdueInvoice[]> = {
      "0-30": [],
      "31-60": [],
      "60+": [],
    };
    for (const r of rows) {
      m[r.bucket].push(r);
    }
    return m;
  }, [rows]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  );

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleBucket(bucketRows: OverdueInvoice[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = bucketRows.every((r) => next.has(r.id));
      if (allSelected) {
        for (const r of bucketRows) next.delete(r.id);
      } else {
        for (const r of bucketRows) next.add(r.id);
      }
      return next;
    });
  }

  function clientName(row: OverdueInvoice): string {
    return isGreek ? row.client_name_el : row.client_name_en;
  }

  function bucketLabel(b: AgingBucket): string {
    if (b === "0-30") return t("bucket0to30");
    if (b === "31-60") return t("bucket31to60");
    return t("bucket60Plus");
  }

  function bucketTotalEUR(bucketRows: OverdueInvoice[]): {
    sum: number;
    currency: string;
  } {
    let sum = 0;
    let currency = "EUR";
    for (const r of bucketRows) {
      sum += Number(r.total);
      currency = r.currency;
    }
    return { sum, currency };
  }

  const daysOverdueLabel = (n: number): string =>
    isGreek ? `${n} ημέρες` : n === 1 ? `${n} day` : `${n} days`;

  return (
    <>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between flex-wrap gap-4 mb-6 px-1"
      >
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {selected.size === 0
            ? null
            : isGreek
              ? `${selected.size} επιλεγμένα`
              : `${selected.size} selected`}
        </p>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-md text-sm font-medium transition-colors"
          style={{
            background:
              selected.size === 0 ? "var(--surface-2)" : "var(--accent)",
            color: selected.size === 0 ? "var(--dim)" : "var(--bg)",
            cursor: selected.size === 0 ? "not-allowed" : "pointer",
          }}
        >
          {t("draftRemindersBtn")} ({selected.size})
        </button>
      </div>

      {/* Buckets */}
      <div className="space-y-6">
        {BUCKETS.map((b) => {
          const bucketRows = byBucket[b];
          const { sum, currency } = bucketTotalEUR(bucketRows);
          const tone = BUCKET_TONE[b];
          const allChecked =
            bucketRows.length > 0 &&
            bucketRows.every((r) => selected.has(r.id));
          return (
            <details
              key={b}
              open
              className="rounded-lg border overflow-hidden"
              style={{
                borderColor: "var(--line)",
                background: "var(--bg)",
              }}
            >
              <summary
                className="flex items-center justify-between flex-wrap gap-3 px-5 py-4 cursor-pointer"
                style={{
                  background: "var(--bg-2)",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="font-display text-base"
                    style={{ color: "var(--text)" }}
                  >
                    {bucketLabel(b)}
                  </span>
                  {tone ? (
                    <StatusPill tone={tone}>{bucketLabel(b)}</StatusPill>
                  ) : null}
                  <span
                    className="text-xs"
                    style={{ color: "var(--muted)" }}
                  >
                    {bucketRows.length}
                  </span>
                </span>
                <span
                  className="tabular text-sm"
                  style={{ color: "var(--text)", fontWeight: 500 }}
                >
                  {formatMoney(sum, currency, locale)}
                </span>
              </summary>

              {bucketRows.length === 0 ? (
                <div
                  className="px-5 py-8 text-center text-sm"
                  style={{ color: "var(--dim)" }}
                >
                  —
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-sm"
                    style={{
                      minWidth: "720px",
                      borderCollapse: "collapse",
                    }}
                  >
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          className="px-5 py-3"
                          style={{
                            width: "44px",
                            textAlign: "center",
                            borderBottom: "1px solid var(--line)",
                          }}
                        >
                          <input
                            type="checkbox"
                            aria-label={t("selectAllInBucket")}
                            checked={allChecked}
                            onChange={() => toggleBucket(bucketRows)}
                          />
                        </th>
                        <th
                          scope="col"
                          className="text-[0.7rem] uppercase font-normal px-5 py-3"
                          style={{
                            textAlign: "left",
                            letterSpacing: "0.08em",
                            color: "var(--dim)",
                            borderBottom: "1px solid var(--line)",
                          }}
                        >
                          {t("clientCol")}
                        </th>
                        <th
                          scope="col"
                          className="text-[0.7rem] uppercase font-normal px-5 py-3"
                          style={{
                            textAlign: "left",
                            letterSpacing: "0.08em",
                            color: "var(--dim)",
                            borderBottom: "1px solid var(--line)",
                          }}
                        >
                          {t("matterCol")}
                        </th>
                        <th
                          scope="col"
                          className="text-[0.7rem] uppercase font-normal px-5 py-3"
                          style={{
                            textAlign: "left",
                            letterSpacing: "0.08em",
                            color: "var(--dim)",
                            borderBottom: "1px solid var(--line)",
                          }}
                        >
                          {t("invoiceCol")}
                        </th>
                        <th
                          scope="col"
                          className="text-[0.7rem] uppercase font-normal px-5 py-3"
                          style={{
                            textAlign: "right",
                            letterSpacing: "0.08em",
                            color: "var(--dim)",
                            borderBottom: "1px solid var(--line)",
                          }}
                        >
                          {t("amountCol")}
                        </th>
                        <th
                          scope="col"
                          className="text-[0.7rem] uppercase font-normal px-5 py-3"
                          style={{
                            textAlign: "right",
                            letterSpacing: "0.08em",
                            color: "var(--dim)",
                            borderBottom: "1px solid var(--line)",
                          }}
                        >
                          {t("daysOverdueCol")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucketRows.map((row) => {
                        const checked = selected.has(row.id);
                        const missingEmail = !row.client_email;
                        return (
                          <tr
                            key={row.id}
                            style={{
                              borderTop: "1px solid var(--line-soft)",
                            }}
                          >
                            <td
                              className="px-5 py-4"
                              style={{ textAlign: "center" }}
                            >
                              <input
                                type="checkbox"
                                aria-label={`${clientName(row)} — ${row.invoice_number}`}
                                checked={checked}
                                onChange={() => toggleOne(row.id)}
                              />
                            </td>
                            <td
                              className="px-5 py-4"
                              style={{ color: "var(--text)" }}
                            >
                              <span>{clientName(row)}</span>
                              {missingEmail ? (
                                <span
                                  className="ml-2 text-[10px] uppercase tracking-widest"
                                  style={{ color: "var(--kill)" }}
                                >
                                  {isGreek ? "χωρίς email" : "no email"}
                                </span>
                              ) : null}
                            </td>
                            <td
                              className="px-5 py-4 tabular text-xs"
                              style={{ color: "var(--muted)" }}
                            >
                              {row.matter_number}
                            </td>
                            <td
                              className="px-5 py-4 tabular"
                              style={{ color: "var(--accent)" }}
                            >
                              {row.invoice_number}
                            </td>
                            <td
                              className="px-5 py-4 tabular"
                              style={{
                                color: "var(--text)",
                                textAlign: "right",
                                fontWeight: 500,
                              }}
                            >
                              {formatMoney(
                                Number(row.total),
                                row.currency,
                                locale,
                              )}
                            </td>
                            <td
                              className="px-5 py-4 tabular"
                              style={{
                                color: "var(--text)",
                                textAlign: "right",
                              }}
                            >
                              {tone ? (
                                <StatusPill tone={tone}>
                                  {daysOverdueLabel(row.days_overdue)}
                                </StatusPill>
                              ) : (
                                <span style={{ color: "var(--muted)" }}>
                                  {daysOverdueLabel(row.days_overdue)}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          );
        })}
      </div>

      <DraftReminderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        rows={selectedRows}
        locale={locale}
      />
    </>
  );
}
