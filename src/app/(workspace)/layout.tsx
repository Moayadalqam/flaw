import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ActiveTimerWidget } from "@/components/ActiveTimerWidget";
import { CommandBar } from "@/components/CommandBar";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch the workspace owned by this user. RLS scopes the query.
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  const workspaceName = workspace?.name ?? "Lex";

  return (
    <div
      className="flex min-h-screen w-full"
      style={{ background: "var(--bg)" }}
    >
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar
          workspaceName={workspaceName}
          userEmail={user.email ?? null}
          activeTimerWidget={<ActiveTimerWidget />}
        />
        <main className="flex-1 w-full px-[var(--pad-x)] py-[var(--pad-section)]">
          {children}
        </main>
      </div>
      <CommandBar />
    </div>
  );
}
