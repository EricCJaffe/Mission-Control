import NavLink from "@/components/NavLink";

type SidebarProps = {
  userEmail: string | null;
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
};

export default function Sidebar({
  userEmail,
  isOpen = true,
  onClose,
  isCollapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const handleNavigate = () => {
    if (onClose) onClose();
  };

  return (
    <aside
      className={`border-b border-white/70 bg-white/95 backdrop-blur md:min-h-screen md:border-b-0 md:border-r md:sticky md:top-0 md:h-screen md:overflow-y-auto ${
        isOpen ? "block" : "hidden"
      } md:block ${isCollapsed ? "md:w-20" : "md:w-64"} transition-[width] duration-200`}
    >
      <div className="flex items-center justify-between px-6 py-5 md:flex-col md:items-start md:gap-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-blue-700 text-white flex items-center justify-center font-semibold">
            TM
          </div>
          {!isCollapsed && (
            <div className="leading-tight">
            <div className="text-xs uppercase tracking-[0.18em] text-blue-800">
              Mission Control
            </div>
            <div className="text-base font-semibold">TacPastor</div>
          </div>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          {onClose && (
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm"
              type="button"
              onClick={onClose}
            >
              Close
            </button>
          )}
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

        <div className="hidden md:flex items-center gap-2" />
      </div>

      <div className="px-6 pb-6 md:pb-10">
        <div className={`hidden text-xs text-slate-500 md:block ${isCollapsed ? "opacity-0 h-0 overflow-hidden" : ""}`}>
          {userEmail ? `Signed in as ${userEmail}` : "Not signed in"}
        </div>

        <div className="mt-6 grid gap-4">
          <div>
            <div className={`text-xs uppercase tracking-[0.2em] text-slate-500 ${isCollapsed ? "sr-only" : ""}`}>Core</div>
            <div className={`mt-2 grid gap-2 ${isCollapsed ? "place-items-center" : ""}`}>
              <NavLink href="/dashboard" label="Dashboard" shortLabel="DB" collapsed={isCollapsed} icon="🏠" onClick={handleNavigate} />
              <NavLink href="/projects" label="Projects" shortLabel="PR" collapsed={isCollapsed} icon="🧭" onClick={handleNavigate} />
              <NavLink href="/tasks" label="Tasks" shortLabel="TS" collapsed={isCollapsed} icon="✅" onClick={handleNavigate} />
              <NavLink href="/calendar" label="Calendar" shortLabel="CL" collapsed={isCollapsed} icon="📅" onClick={handleNavigate} />
              <NavLink href="/metrics" label="Metrics" shortLabel="MX" collapsed={isCollapsed} icon="📊" onClick={handleNavigate} />
              <NavLink href="/books" label="Books" shortLabel="BK" collapsed={isCollapsed} icon="📘" onClick={handleNavigate} />
              <NavLink href="/ai" label="AI Companion" shortLabel="AI" collapsed={isCollapsed} icon="🤖" onClick={handleNavigate} />
            </div>
          </div>

          <div>
            <div className={`text-xs uppercase tracking-[0.2em] text-slate-500 ${isCollapsed ? "sr-only" : ""}`}>Planning</div>
            <div className={`mt-2 grid gap-2 ${isCollapsed ? "place-items-center" : ""}`}>
              <NavLink href="/goals" label="Goals" shortLabel="GL" collapsed={isCollapsed} icon="🎯" onClick={handleNavigate} />
              <NavLink href="/reviews" label="Reviews" shortLabel="RV" collapsed={isCollapsed} icon="🧾" onClick={handleNavigate} />
              <NavLink href="/templates" label="Templates" shortLabel="TP" collapsed={isCollapsed} icon="📋" onClick={handleNavigate} />
            </div>
          </div>

          <div>
            <div className={`text-xs uppercase tracking-[0.2em] text-slate-500 ${isCollapsed ? "sr-only" : ""}`}>Knowledge</div>
            <div className={`mt-2 grid gap-2 ${isCollapsed ? "place-items-center" : ""}`}>
              <NavLink href="/notes" label="Notes" shortLabel="NT" collapsed={isCollapsed} icon="🗒️" onClick={handleNavigate} />
              <NavLink href="/knowledge" label="Persona/Soul" shortLabel="PS" collapsed={isCollapsed} icon="🧠" onClick={handleNavigate} />
              <NavLink href="/sops" label="SOPs" shortLabel="SOP" collapsed={isCollapsed} icon="📌" onClick={handleNavigate} />
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
