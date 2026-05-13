import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Square } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Table, type Column } from "@/components/Table";
import { StatusPill, type Tone } from "@/components/StatusPill";
import { formatDate, formatMoney, type LexLocale } from "@/lib/format";
import type {
  MatterRow,
  TimeEntryStatus,
  TimeEntryWithRelations,
} from "@/lib/types";
import { LiveElapsed } from "@/app/(workspace)/timer/LiveElapsed";
import { StartTimerForm } from "@/app/(workspace)/timer/StartTimerForm";
import {
  billHoursAction,
  stopTimerFormAction,
} from "@/app/(workspace)/timer/actions";

export const metadata: Metadata = {
  title: "Billable hours · Lex",
};

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<TimeEntryStatus, Tone> = {
  active: "warn",
  completed: "ok",
  billed: "muted",
};

function formatDurationHMS(totalSeconds: number): string {
  if (totalSeconds <= 0) return "00:00:00";
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function hoursFromSeconds(totalSeconds: number): number {
  // Two-decimal precision without floating-point drift (5400s → 1.50).
  return Math.round(totalSeconds / 36) / 100;
}

export default async function TimerPage() {
  const supabase = await createClient();
  const t = await getTranslations("timer");
  const locale = (await getLocale()) as LexLocale;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Workspace gate is enforced upstream in `(workspace)/layout.tsx`; user is
  // guaranteed non-null inside this layout.
  const userId = user!.id;

  // RLS-scoped query for the active timer for THIS user. The partial unique
  // index guarantees at most one row.
  const { data: activeData } = await supabase
    .from("time_entries")
    .select(
      "*, matters!inner(matter_number, title, client_id), invoices(invoice_number)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .returns<TimeEntryWithRelations[]>();
  const active = activeData?.[0] ?? null;

  // Recent completed + billed entries (last 20). The active timer renders
  // above the table; we exclude it here so it doesn't double-render.
  const { data: recentData } = await supabase
    .from("time_entries")
    .select(
      "*, matters!inner(matter_number, title, client_id), invoices(invoice_number)",
    )
    .eq("user_id", userId)
    .in("status", ["completed", "billed"])
    .order("started_at", { ascending: false })
    .limit(20)
    .returns<TimeEntryWithRelations[]>();
  const recent: TimeEntryWithRelations[] = recentData ?? [];

  // Matters list for the start-form select. Open matters only (closed
  // matters shouldn't accept new billable hours). Each row carries its
  // `default_hourly_rate` so the form can prefill on change.
  const { data: mattersData } = await supabase
    .from("matters")
    .select("id, matter_number, title, default_hourly_rate, status")
    .eq("status", "open")
    .order("matter_number", { ascending: true })
    .returns<
      Pick<
        MatterRow,
        "id" | "matter_number" | "title" | "default_hourly_rate" | "status"
      >[]
    >();
  const matters = (mattersData ?? []).map((m) => ({
    id: m.id,
    matter_number: m.matter_number,
    title: m.title,
    default_hourly_rate: m.default_hourly_rate,
  }));

  const statusLabel = (s: TimeEntryStatus): string => {
    switch (s) {
      case "active":
        return t("statusActive");
      case "completed":
        return t("statusCompleted");
      case "billed":
        return t("statusBilled");
    }
  };

  const columns: Column<TimeEntryWithRelations>[] = [
    {
      key: "matter",
      header: t("matter"),
      render: (row) => (
        <div className="flex flex-col">
          <span
            className="tabular text-xs"
            style={{ color: "var(--accent)" }}
          >
            {row.matters?.matter_number ?? "\u2014"}
          </span>
          <span
            className="text-sm truncate"
            style={{ color: "var(--text)" }}
          >
            {row.description ?? row.matters?.title ?? "\u2014"}
          </span>
        </div>
      ),
    },
    {
      key: "started",
      header: t("started"),
      numeric: true,
      render: (row) => (
        <span style={{ color: "var(--muted)" }}>
          {formatDate(row.started_at, locale)}
        </span>
      ),
    },
    {
      key: "duration",
      header: t("duration"),
      numeric: true,
      render: (row) => (
        <span style={{ color: "var(--text)" }}>
          {row.duration_seconds
            ? formatDurationHMS(row.duration_seconds)
            : "\u2014"}
        </span>
      ),
    },
    {
      key: "rate",
      header: t("rate"),
      numeric: true,
      render: (row) => (
        <span style={{ color: "var(--muted)" }}>
          {formatMoney(Number(row.hourly_rate), "EUR", locale)}
        </span>
      ),
    },
    {
      key: "total",
      header: t("total"),
      numeric: true,
      render: (row) => {
        const seconds = row.duration_seconds ?? 0;
        const hours = hoursFromSeconds(seconds);
        const total = Math.round(hours * Number(row.hourly_rate) * 100) / 100;
        return (
          <span style={{ color: "var(--text)", fontWeight: 500 }}>
            {formatMoney(total, "EUR", locale)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: t("status"),
      align: "center",
      render: (row) => (
        <StatusPill tone={STATUS_TONE[row.status]}>
          {statusLabel(row.status)}
        </StatusPill>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) => {
        if (row.status === "completed") {
          const billAction = billHoursAction.bind(null, row.id);
          return (
            <form action={billAction}>
              <button
                type="submit"
                className="inline-flex items-center min-h-[44px] px-3 rounded-md text-xs font-medium transition-colors"
                style={{
                  background: "var(--accent)",
                  color: "var(--bg)",
                }}
              >
                {t("billTheseHours")}
              </button>
            </form>
          );
        }
        if (row.status === "billed" && row.invoice_id) {
          return (
            <Link
              href={`/invoices/${row.invoice_id}`}
              className="text-sm transition-colors"
              style={{ color: "var(--muted)" }}
            >
              {t("alreadyBilled", {
                number: row.invoices?.invoice_number ?? "\u2014",
              })}
            </Link>
          );
        }
        return null;
      },
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <header className="mb-10">
        <p
          className="text-[10px] uppercase tracking-widest mb-2"
          style={{ color: "var(--accent)", letterSpacing: "0.08em" }}
        >
          {t("title")}
        </p>
        <h1
          className="font-display text-4xl tracking-tight"
          style={{ color: "var(--text)", letterSpacing: "-0.018em" }}
        >
          {t("title")}
        </h1>
      </header>

      {active ? (
        <section
          className="border rounded-lg p-6 mb-10"
          style={{
            borderColor: "var(--line)",
            background: "var(--surface)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p
                className="text-[10px] uppercase tracking-widest mb-1"
                style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
              >
                {t("activeNow")}
              </p>
              <p
                className="tabular text-sm"
                style={{ color: "var(--accent)" }}
              >
                {active.matters?.matter_number ?? "\u2014"}
              </p>
              <p
                className="text-base truncate"
                style={{ color: "var(--text)" }}
              >
                {active.description ??
                  active.matters?.title ??
                  "\u2014"}
              </p>
            </div>

            <div className="flex items-center gap-4">
              <LiveElapsed
                startedAt={active.started_at}
                className="font-display text-3xl"
              />
              <form action={stopTimerFormAction.bind(null, active.id)}>
                <button
                  type="submit"
                  aria-label={t("stop")}
                  className="inline-flex items-center justify-center rounded-md transition-colors"
                  style={{
                    background: "var(--accent)",
                    color: "var(--bg)",
                    width: "44px",
                    height: "44px",
                  }}
                >
                  <Square size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>
        </section>
      ) : (
        <section
          className="border rounded-lg p-6 mb-10"
          style={{
            borderColor: "var(--line)",
            background: "var(--surface)",
          }}
        >
          <p
            className="text-[10px] uppercase tracking-widest mb-4"
            style={{ color: "var(--dim)", letterSpacing: "0.08em" }}
          >
            {t("start")}
          </p>
          <StartTimerForm matters={matters} />
        </section>
      )}

      <Table<TimeEntryWithRelations>
        columns={columns}
        rows={recent}
        emptyLabel={t("emptyState")}
        rowKey={(row) => row.id}
      />
    </div>
  );
}
