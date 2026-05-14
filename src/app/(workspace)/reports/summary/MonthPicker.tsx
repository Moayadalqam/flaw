"use client";

/**
 * Month picker for `/reports/summary`.
 *
 * URL-driven: changing the picker triggers `router.replace('/reports/summary?month=YYYY-MM')`
 * so the summary page can re-fetch on the server. `replace` (not `push`)
 * keeps the back-button intact — month changes are not new history entries.
 *
 * Native `<input type="month">` is the entire UI. Browsers render their own
 * month-grid affordance; we don't reach for a custom calendar. The visual
 * style mirrors the form inputs in NewInvoiceForm.tsx (`inputStyle`).
 */

import { useRouter } from "next/navigation";

interface Props {
  initial: string;
  label: string;
}

export function MonthPicker({ initial, label }: Props) {
  const router = useRouter();
  return (
    <label
      className="inline-flex flex-col gap-1.5"
      style={{ color: "var(--muted)" }}
    >
      <span
        className="text-[10px] uppercase tracking-widest"
        style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
      >
        {label}
      </span>
      <input
        type="month"
        defaultValue={initial}
        onChange={(e) => {
          const value = e.target.value;
          if (value) {
            router.replace(`/reports/summary?month=${value}`);
          }
        }}
        aria-label={label}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--line)",
          color: "var(--text)",
          borderRadius: "4px",
          padding: "0.55rem 0.75rem",
          minHeight: "44px",
          minWidth: "180px",
        }}
      />
    </label>
  );
}
