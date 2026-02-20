import NavLink from "@/components/NavLink";

type SidebarProps = {
  userEmail: string | null;
};

export default function Sidebar({ userEmail }: SidebarProps) {
  return (
    <aside className="border-b border-white/70 bg-white/70 backdrop-blur md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="flex items-center justify-between px-6 py-5 md:flex-col md:items-start md:gap-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-blue-700 text-white flex items-center justify-center font-semibold">
            TM
          </div>
          <div className="leading-tight">
            <div className="text-xs uppercase tracking-[0.18em] text-blue-800">
              Mission Control
            </div>
            <div className="text-base font-semibold">TacPastor</div>
          </div>
        </div>

        <div className="flex items-center gap-3 md:hidden">
          {userEmail ? (
            <form action="/auth/signout" method="post">
              <button
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:text-slate-900"
                type="submit"
              >
                Sign out
              </button>
            </form>
          ) : (
            <NavLink href="/login" label="Sign in" />
          )}
        </div>
      </div>

      <div className="px-6 pb-6 md:pb-10">
        <div className="hidden text-xs text-slate-500 md:block">
          {userEmail ? `Signed in as ${userEmail}` : "Not signed in"}
        </div>

        <div className="mt-6 grid gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Core</div>
            <div className="mt-2 grid gap-2">
              <NavLink href="/dashboard" label="Dashboard" />
              <NavLink href="/projects" label="Projects" />
              <NavLink href="/tasks" label="Tasks" />
              <NavLink href="/calendar" label="Calendar" />
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Planning</div>
            <div className="mt-2 grid gap-2">
              <NavLink href="/goals" label="Goals" />
              <NavLink href="/reviews" label="Reviews" />
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Knowledge</div>
            <div className="mt-2 grid gap-2">
              <NavLink href="/notes" label="Notes" />
              <NavLink href="/knowledge" label="Persona/Soul" />
              <NavLink href="/sops" label="SOPs" />
            </div>
          </div>

          <div className="hidden md:block">
            {userEmail ? (
              <form action="/auth/signout" method="post">
                <button
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:text-slate-900"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            ) : (
              <NavLink href="/login" label="Sign in" />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
