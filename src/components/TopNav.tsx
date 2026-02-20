import NavLink from "@/components/NavLink";

type TopNavProps = {
  userEmail: string | null;
};

export default function TopNav({ userEmail }: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/70 bg-white/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl bg-blue-700 text-white flex items-center justify-center font-semibold">
            TM
          </div>
          <div className="leading-tight">
            <div className="text-sm uppercase tracking-[0.18em] text-blue-800">
              Mission Control
            </div>
            <div className="text-base font-semibold">TacPastor</div>
          </div>
        </div>

        <nav className="hidden flex-wrap items-center gap-2 md:flex">
          <NavLink href="/dashboard" label="Dashboard" />
          <NavLink href="/projects" label="Projects" />
          <NavLink href="/tasks" label="Tasks" />
          <NavLink href="/calendar" label="Calendar" />
          <NavLink href="/notes" label="Notes" />
          <NavLink href="/knowledge" label="Knowledge" />
          <NavLink href="/health" label="Health" />
        </nav>

        <div className="flex items-center gap-3">
          {userEmail ? (
            <>
              <div className="hidden text-xs text-slate-500 md:block">{userEmail}</div>
              <form action="/auth/signout" method="post">
                <button
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-300 hover:text-slate-900"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <NavLink href="/login" label="Sign in" />
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-6xl gap-2 px-6 pb-3 md:hidden">
        <NavLink href="/dashboard" label="Dashboard" />
        <NavLink href="/projects" label="Projects" />
        <NavLink href="/tasks" label="Tasks" />
        <NavLink href="/calendar" label="Calendar" />
        <NavLink href="/notes" label="Notes" />
        <NavLink href="/knowledge" label="Knowledge" />
        <NavLink href="/health" label="Health" />
      </div>
    </header>
  );
}
