"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutGrid,
  Users,
  Briefcase,
  FileText,
  Receipt,
  FileCheck,
  Wallet,
  ShieldCheck,
  Sparkles,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  href: string;
  key:
    | "dashboard"
    | "clients"
    | "cases"
    | "invoices"
    | "drafts"
    | "receipts"
    | "quotations"
    | "retainers"
    | "trust"
    | "assistant"
    | "reports";
  icon: LucideIcon;
  trust?: boolean;
};

// Order is locked by the design spec: Dashboard, Clients, Cases, Invoices,
// Drafts (Phase 5 — AI review queue), Receipts, Quotations, Retainers,
// Trust ledger, Assistant, Reports.
const ITEMS: ReadonlyArray<NavItem> = [
  { href: "/dashboard", key: "dashboard", icon: LayoutGrid },
  { href: "/clients", key: "clients", icon: Users },
  { href: "/cases", key: "cases", icon: Briefcase },
  { href: "/invoices", key: "invoices", icon: FileText },
  { href: "/drafts", key: "drafts", icon: Sparkles },
  { href: "/receipts", key: "receipts", icon: Receipt },
  { href: "/quotations", key: "quotations", icon: FileCheck },
  { href: "/retainers", key: "retainers", icon: Wallet },
  { href: "/trust", key: "trust", icon: ShieldCheck, trust: true },
  { href: "/ai", key: "assistant", icon: Sparkles },
  { href: "/reports", key: "reports", icon: BarChart3 },
];

export function SidebarNav({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      aria-label={t("dashboard")}
      className="flex flex-col gap-0.5 px-3 py-4 w-full"
    >
      {ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        // Trust ledger uses sage-olive when active; revenue items use terracotta.
        const activeBg = item.trust
          ? "var(--trust-bg)"
          : "var(--accent-bg)";
        const activeColor = item.trust ? "var(--trust)" : "var(--accent)";

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className="flex items-center gap-3 min-h-[44px] px-3 py-2.5 rounded-md text-sm transition-colors"
            style={{
              background: active ? activeBg : "transparent",
              color: active ? activeColor : "var(--muted)",
              fontWeight: active ? 500 : 400,
            }}
          >
            <Icon
              size={20}
              strokeWidth={1.5}
              aria-hidden="true"
              className="shrink-0"
            />
            <span className="leading-tight break-words">{t(item.key)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
