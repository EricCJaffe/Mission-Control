"use client";

import { useState } from "react";
import Sidebar from "@/components/Sidebar";

type AppShellProps = {
  userEmail: string | null;
  children: React.ReactNode;
};

export default function AppShell({ userEmail, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
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

      <div className="flex-1 px-4 pb-16 pt-4 md:px-6 md:pt-6">
        <div className="mb-4 flex items-center justify-between md:hidden">
          <button
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
            type="button"
            onClick={() => setSidebarOpen(true)}
          >
            Menu
          </button>
          {userEmail && <div className="text-xs text-slate-500">Signed in</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
