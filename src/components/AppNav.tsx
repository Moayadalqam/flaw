import Link from "next/link";

const NAV = [
  { href: "/", label: "Lex", display: true },
  { href: "/invoices", label: "Invoices" },
  { href: "/quotations", label: "Quotations" },
  { href: "/receipts", label: "Receipts" },
  { href: "/retainers", label: "Retainers" },
  { href: "/clients", label: "Clients" },
  { href: "/trust-ledger", label: "Trust" },
  { href: "/reports/summary", label: "Summary" },
];

export function AppNav({ current }: { current?: string }) {
  return (
    <header className="w-full px-[var(--pad-x)] py-5 border-b border-[var(--line-soft)] bg-[var(--bg)]">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
        <Link
          href="/"
          className="font-display text-xl tracking-tight"
          style={{ color: "var(--accent)" }}
        >
          Lex
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.filter((n) => !n.display).map((n) => {
            const active = current === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`px-3 py-2 rounded-md transition-colors ${
                  active
                    ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium"
                    : "text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--bg-2)]"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
