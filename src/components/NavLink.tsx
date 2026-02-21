"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinkProps = {
  href: string;
  label: string;
  shortLabel?: string;
  collapsed?: boolean;
  icon?: React.ReactNode;
};

export default function NavLink({ href, label, shortLabel, collapsed, icon }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
  const display = collapsed ? (shortLabel || label.slice(0, 2).toUpperCase()) : label;

  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-sm transition ${collapsed ? "text-xs text-center" : ""} ${
        isActive
          ? "bg-blue-700 text-white shadow-sm"
          : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
      }`}
      title={label}
    >
      <span className={`inline-flex items-center gap-2 ${collapsed ? "justify-center w-full" : ""}`}>
        {icon && <span className="text-base">{icon}</span>}
        {!collapsed && <span>{display}</span>}
      </span>
    </Link>
  );
}
