import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Server-renderable generic table primitive.
 *
 * Re-used across the workspace CRUD surfaces (Clients, Cases, Invoices,
 * Receipts, Quotations, Retainers, Trust ledger). Designed per DESIGN.md
 * §Tables:
 *   - Sticky header on `--bg-2` with caption-style column labels
 *   - Right-align numeric columns, `.tabular` numerals
 *   - Hover row background `--surface`
 *   - Row click → `rowHref(row)` navigate (no popover)
 *   - Mobile: single horizontally-scrollable table with `min-w-[640px]`;
 *     card-view mode is Phase 6 polish.
 */

export interface Column<Row> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  numeric?: boolean;
  render: (row: Row) => ReactNode;
}

export interface TableProps<Row> {
  columns: Column<Row>[];
  rows: Row[];
  emptyLabel: string;
  rowHref?: (row: Row) => string;
  rowKey: (row: Row) => string;
}

export function Table<Row>({
  columns,
  rows,
  emptyLabel,
  rowHref,
  rowKey,
}: TableProps<Row>) {
  if (rows.length === 0) {
    return (
      <div
        className="border border-dashed rounded-lg px-8 py-12 text-center"
        style={{
          borderColor: "var(--line)",
          background: "var(--bg)",
          color: "var(--muted)",
        }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      className="border rounded-lg overflow-x-auto"
      style={{
        borderColor: "var(--line)",
        background: "var(--bg)",
      }}
    >
      <table
        className="w-full text-sm"
        style={{ minWidth: "640px", borderCollapse: "collapse" }}
      >
        <thead
          className="sticky top-0 z-10"
          style={{
            background: "var(--bg-2)",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="text-[0.7rem] uppercase font-normal px-5 py-3"
                style={{
                  textAlign: col.align ?? (col.numeric ? "right" : "left"),
                  letterSpacing: "0.08em",
                  color: "var(--dim)",
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row);
            return (
              <tr
                key={rowKey(row)}
                className="transition-colors hover:bg-[var(--surface)]"
                style={{
                  borderTop: "1px solid var(--line-soft)",
                }}
              >
                {columns.map((col, idx) => {
                  const align = col.align ?? (col.numeric ? "right" : "left");
                  const cellClass = col.numeric ? "tabular" : "";
                  // First-cell wraps in <Link> when rowHref provided so the
                  // row is keyboard-navigable without nesting interactive
                  // controls inside <tr>.
                  if (idx === 0 && href) {
                    return (
                      <td
                        key={col.key}
                        className={`px-5 py-4 ${cellClass}`}
                        style={{
                          textAlign: align,
                          color: "var(--text)",
                        }}
                      >
                        <Link
                          href={href}
                          className="block transition-colors hover:text-[var(--accent)]"
                          style={{ color: "inherit" }}
                        >
                          {col.render(row)}
                        </Link>
                      </td>
                    );
                  }
                  return (
                    <td
                      key={col.key}
                      className={`px-5 py-4 ${cellClass}`}
                      style={{
                        textAlign: align,
                        color: "var(--text)",
                      }}
                    >
                      {col.render(row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
