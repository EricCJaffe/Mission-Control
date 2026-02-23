"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import UiFeedbackProvider from "@/components/UiFeedbackProvider";

type AppShellProps = {
  userEmail: string | null;
  children: React.ReactNode;
};

export default function AppShell({ userEmail, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("mc:sidebar-collapsed") : null;
    if (stored === "true") setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("mc:sidebar-collapsed", sidebarCollapsed ? "true" : "false");
  }, [sidebarCollapsed]);

  return (
    <UiFeedbackProvider>
      <div className="min-h-screen md:flex">
        <div className={`fixed inset-0 z-40 bg-slate-900/30 transition-opacity md:hidden ${sidebarOpen ? "block" : "hidden"}`} onClick={() => setSidebarOpen(false)} />
        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform md:static md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          } ${sidebarCollapsed ? "md:w-20" : "md:w-64"}`}
        >
          <Sidebar
            userEmail={userEmail}
            isOpen={sidebarOpen || undefined}
            onClose={() => setSidebarOpen(false)}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          />
        </div>

        <div className="flex-1">
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center gap-2">
              <button
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm md:hidden"
                type="button"
                onClick={() => setSidebarOpen(true)}
              >
                Menu
              </button>
              <button
                className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm md:inline-flex"
                type="button"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
              >
                {sidebarCollapsed ? "Expand" : "Collapse"}
              </button>
            </div>
            {userEmail && <div className="text-xs text-slate-500">{userEmail}</div>}
          </div>
          <div className="px-4 pb-16 pt-4 md:px-6 md:pt-6">{children}</div>
        </div>
      </div>
    </UiFeedbackProvider>
  );
}
