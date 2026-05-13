"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { LocaleToggle } from "@/components/LocaleToggle";
import { SidebarNav } from "@/components/SidebarNav";

export function TopBar({
  workspaceName,
  userEmail,
}: {
  workspaceName: string;
  userEmail: string | null;
}) {
  const t = useTranslations();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Lock body scroll while the drawer is open, and close on Escape.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  return (
    <>
      <header
        className="flex items-center justify-between gap-3 h-16 px-[var(--pad-x)] border-b shrink-0"
        style={{
          borderColor: "var(--line-soft)",
          background: "var(--bg)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("nav.openMenu")}
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav-drawer"
            className="lg:hidden inline-flex items-center justify-center w-11 h-11 -ml-2 rounded-md text-[var(--text)] hover:bg-[var(--bg-2)] transition-colors"
          >
            <Menu size={20} strokeWidth={1.5} aria-hidden="true" />
          </button>
          <h2
            className="font-display text-xl md:text-2xl tracking-tight truncate"
            style={{ color: "var(--text)", letterSpacing: "-0.012em" }}
            title={workspaceName}
          >
            {workspaceName}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {userEmail && (
            <span
              className="hidden md:inline text-xs tabular truncate max-w-[18ch]"
              style={{ color: "var(--dim)" }}
              title={userEmail}
            >
              {userEmail}
            </span>
          )}
          <LocaleToggle />
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-md text-sm border transition-colors"
              style={{
                borderColor: "var(--line)",
                color: "var(--text)",
                background: "var(--bg)",
              }}
            >
              {t("auth.signOut")}
            </button>
          </form>
        </div>
      </header>

      {/* Mobile drawer — only renders below lg */}
      {drawerOpen && (
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label={t("nav.openMenu")}
          className="lg:hidden fixed inset-0 z-50 flex"
        >
          {/* Backdrop */}
          <button
            type="button"
            aria-label={t("nav.closeMenu")}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/30"
            style={{ background: "color-mix(in oklch, var(--text) 35%, transparent)" }}
          />
          {/* Drawer panel */}
          <div
            className="relative flex flex-col w-[18rem] max-w-[85vw] h-full border-r shadow-xl"
            style={{
              background: "var(--bg-2)",
              borderColor: "var(--line-soft)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b shrink-0"
              style={{ borderColor: "var(--line-soft)" }}
            >
              <span
                className="font-display text-2xl tracking-tight"
                style={{ color: "var(--accent)", letterSpacing: "-0.025em" }}
              >
                Lex
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label={t("nav.closeMenu")}
                className="inline-flex items-center justify-center w-11 h-11 -mr-2 rounded-md text-[var(--text)] hover:bg-[var(--bg)] transition-colors"
              >
                <X size={20} strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <SidebarNav onNavigate={() => setDrawerOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
