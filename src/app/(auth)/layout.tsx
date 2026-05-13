import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center py-12"
      style={{ paddingLeft: "var(--pad-x)", paddingRight: "var(--pad-x)", background: "var(--bg)" }}
    >
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
