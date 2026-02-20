"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinkProps = {
  href: string;
  label: string;
};

export default function NavLink({ href, label }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1.5 text-sm transition ${
        isActive
          ? "bg-blue-700 text-white shadow-sm"
          : "text-slate-600 hover:text-slate-900 hover:bg-white/70"
      }`}
    >
      {label}
    </Link>
  );
}
