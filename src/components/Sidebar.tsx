"use client";

import NavLink from "@/components/NavLink";
import {
  LayoutDashboard,
  Compass,
  CheckSquare,
  CalendarDays,
  BarChart3,
  Dumbbell,
  BookOpen,
  Mic,
  Target,
  ClipboardList,
  StickyNote,
  Flame,
  Sparkles,
  HeartPulse,
  Footprints,
  Settings, HandHeart} from "lucide-react";
import { FEATURES } from "@/lib/feature-flags";

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
      className={`border-b border-slate-100 bg-white/95 backdrop-blur md:min-h-screen md:border-b-0 md:border-r md:sticky md:top-0 md:h-screen md:overflow-y-auto ${
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
          {/* Grouped by the app's own frame — Spirit / Soul / Body — so the
              navigation teaches the model instead of hiding it under "Core". */}
          <div>
            <div className={`text-xs uppercase tracking-[0.2em] text-slate-500 ${isCollapsed ? "sr-only" : ""}`}>Operate</div>
            <div className={`mt-2 grid gap-2 ${isCollapsed ? "place-items-center" : ""}`}>
              <NavLink href="/dashboard" label="Dashboard" shortLabel="DB" collapsed={isCollapsed} icon={<LayoutDashboard size={18} className="text-blue-600" />} onClick={handleNavigate} />
              <NavLink href="/tasks" label="Tasks" shortLabel="TS" collapsed={isCollapsed} icon={<CheckSquare size={18} className="text-green-600" />} onClick={handleNavigate} />
              <NavLink href="/notes" label="Notes" shortLabel="NT" collapsed={isCollapsed} icon={<StickyNote size={18} className="text-yellow-600" />} onClick={handleNavigate} />
              <NavLink href="/calendar" label="Calendar" shortLabel="CL" collapsed={isCollapsed} icon={<CalendarDays size={18} className="text-orange-600" />} onClick={handleNavigate} />
              <NavLink href="/goals" label="Goals" shortLabel="GL" collapsed={isCollapsed} icon={<Target size={18} className="text-cyan-600" />} onClick={handleNavigate} />
              {FEATURES.metricsPage && (
                <NavLink href="/metrics" label="Metrics" shortLabel="MX" collapsed={isCollapsed} icon={<BarChart3 size={18} className="text-purple-600" />} onClick={handleNavigate} />
              )}
              <NavLink href="/projects" label="Projects" shortLabel="PR" collapsed={isCollapsed} icon={<Compass size={18} className="text-indigo-600" />} onClick={handleNavigate} />
            </div>
          </div>
          <div>
            <div className={`text-xs uppercase tracking-[0.2em] text-amber-700 ${isCollapsed ? "sr-only" : ""}`}>Spirit</div>
            <div className={`mt-2 grid gap-2 ${isCollapsed ? "place-items-center" : ""}`}>
              <NavLink href="/spirit" label="Practices" shortLabel="SP" collapsed={isCollapsed} icon={<Flame size={18} className="text-amber-600" />} onClick={handleNavigate} />
              <NavLink href="/spirit/reading" label="Reading Plans" shortLabel="RD" collapsed={isCollapsed} icon={<BookOpen size={18} className="text-amber-600" />} onClick={handleNavigate} />
              <NavLink href="/spirit/prayer" label="Prayer" shortLabel="PR" collapsed={isCollapsed} icon={<HandHeart size={18} className="text-amber-600" />} onClick={handleNavigate} />
              {FEATURES.sermons && (
                <NavLink href="/sermons" label="Sermons" shortLabel="SM" collapsed={isCollapsed} icon={<Mic size={18} className="text-pink-600" />} onClick={handleNavigate} />
              )}
            </div>
          </div>

          <div>
            <div className={`text-xs uppercase tracking-[0.2em] text-violet-700 ${isCollapsed ? "sr-only" : ""}`}>Soul</div>
            <div className={`mt-2 grid gap-2 ${isCollapsed ? "place-items-center" : ""}`}>
              <NavLink href="/flourishing" label="Flourishing" shortLabel="FL" collapsed={isCollapsed} icon={<Sparkles size={18} className="text-violet-600" />} onClick={handleNavigate} />
              <NavLink href="/reviews" label="Reviews" shortLabel="RV" collapsed={isCollapsed} icon={<ClipboardList size={18} className="text-teal-600" />} onClick={handleNavigate} />
              {FEATURES.books && (
                <NavLink href="/books" label="Books" shortLabel="BK" collapsed={isCollapsed} icon={<BookOpen size={18} className="text-amber-600" />} onClick={handleNavigate} />
              )}
            </div>
          </div>

          <div>
            <div className={`text-xs uppercase tracking-[0.2em] text-emerald-700 ${isCollapsed ? "sr-only" : ""}`}>Body</div>
            <div className={`mt-2 grid gap-2 ${isCollapsed ? "place-items-center" : ""}`}>
              <NavLink href="/fitness" label="Fitness" shortLabel="FT" collapsed={isCollapsed} icon={<Dumbbell size={18} className="text-red-600" />} onClick={handleNavigate} />
              <NavLink href="/fitness/health" label="Health" shortLabel="HL" collapsed={isCollapsed} icon={<HeartPulse size={18} className="text-rose-600" />} onClick={handleNavigate} />
              <NavLink href="/fitness/mobility" label="Mobility" shortLabel="MB" collapsed={isCollapsed} icon={<Footprints size={18} className="text-emerald-600" />} onClick={handleNavigate} />
            </div>
          </div>



          {/* Admin: the configuration surfaces, kept out of the daily groups.
              Persona/Soul, SOPs and Templates all describe how the system
              should behave rather than being places you work day to day. */}
          <div>
            <div className={`text-xs uppercase tracking-[0.2em] text-slate-400 ${isCollapsed ? "sr-only" : ""}`}>Admin</div>
            <div className={`mt-2 grid gap-2 ${isCollapsed ? "place-items-center" : ""}`}>
              <NavLink href="/admin" label="Admin" shortLabel="AD" collapsed={isCollapsed} icon={<Settings size={18} className="text-slate-600" />} onClick={handleNavigate} />
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
