"use client";

import { useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import UiFeedbackProvider from "@/components/UiFeedbackProvider";
import ChatWidget from "@/components/ChatWidget";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

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
          className={`fixed inset-y-0 left-0 z-50 w-72 shrink-0 transform transition-transform md:static md:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          } ${sidebarCollapsed ? "md:w-0 md:overflow-hidden md:border-r-0" : "md:w-64"}`}
        >
          <Sidebar
            userEmail={userEmail}
            isOpen={sidebarOpen || undefined}
            onClose={() => setSidebarOpen(false)}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-100 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
            <div className="flex items-center gap-2">
              {/* One toggle at every width. Below md the sidebar is a drawer,
                  so this opens it; at md and up it collapses the persistent
                  rail. Previously these were two separate text buttons and the
                  collapse one only appeared at md+, which read as "no control"
                  on a tablet. */}
              <button
                className="flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
                type="button"
                aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!sidebarCollapsed}
                onClick={() => {
                  if (window.matchMedia("(min-width: 768px)").matches) {
                    setSidebarCollapsed((prev) => !prev);
                  } else {
                    setSidebarOpen(true);
                  }
                }}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
                <span className="hidden sm:inline">{sidebarCollapsed ? "Menu" : "Hide menu"}</span>
              </button>
            </div>
            {userEmail && <div className="text-xs text-slate-500">{userEmail}</div>}
          </div>
          <div className="px-4 pb-16 pt-4 md:px-6 md:pt-6">{children}</div>
        </div>
        {sidebarCollapsed && (
          <button
            className="fixed bottom-5 left-5 z-40 hidden items-center gap-2 rounded-full border-2 border-blue-600 bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-lg hover:bg-blue-700 md:flex"
            type="button"
            aria-label="Expand sidebar"
            onClick={() => setSidebarCollapsed(false)}
          >
            <PanelLeftOpen className="h-4 w-4" />
            Menu
          </button>
        )}
        <ChatWidget />
      </div>
    </UiFeedbackProvider>
  );
}
