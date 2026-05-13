import { SidebarNav } from "@/components/SidebarNav";

export function Sidebar() {
  return (
    <aside
      className="hidden lg:flex lg:flex-col lg:shrink-0 w-60 border-r"
      style={{
        borderColor: "var(--line-soft)",
        background: "var(--bg-2)",
      }}
    >
      <div
        className="px-5 py-5 border-b"
        style={{ borderColor: "var(--line-soft)" }}
      >
        <span
          className="font-display text-2xl tracking-tight"
          style={{ color: "var(--accent)", letterSpacing: "-0.025em" }}
        >
          Lex
        </span>
      </div>
      <SidebarNav />
    </aside>
  );
}
