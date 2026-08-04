import Link from 'next/link';
import type { ReactNode } from 'react';

export type HubCard = {
  href: string;
  title: string;
  body: string;
  icon: ReactNode;
  meta?: string | null;
};

/**
 * A section landing page.
 *
 * The fitness area had 53 routes and 8 top tabs, most pages reachable only by
 * knowing the URL. Grouping them behind five sections means each section needs
 * somewhere to land that says what is inside it, rather than the nav being the
 * only map.
 */
export default function SectionHub({
  title,
  subtitle,
  cards,
}: {
  title: string;
  subtitle: string;
  cards: HubCard[];
}) {
  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-5">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm transition-shadow hover:shadow"
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">{c.icon}</span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{c.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{c.body}</p>
                {c.meta && <p className="mt-1 text-[11px] font-medium text-blue-700">{c.meta}</p>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
