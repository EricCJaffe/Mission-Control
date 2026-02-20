import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import DashboardHome from "@/components/DashboardHome";

export default async function Home() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (user) {
    return <DashboardHome />;
  }

  return (
    <main className="pt-12">
      <section className="rounded-3xl border border-white/80 bg-white/70 p-10 shadow-sm">
        <div className="max-w-2xl">
          <div className="text-xs uppercase tracking-[0.3em] text-blue-800">
            Personal Mission Ops
          </div>
          <h1 className="mt-4 text-4xl font-semibold leading-tight">
            TacPastor’s Mission Control
          </h1>
          <p className="mt-4 text-base text-slate-600">
            A personal-first system for projects, tasks, and markdown knowledge.
            Built to keep Spirit, Soul, and Body aligned with the mission.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link className="rounded-full bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" href="/dashboard">
            Enter Dashboard
          </Link>
          <Link className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" href="/login">
            Sign in
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          { title: "Projects", body: "Keep the mission list crisp, scoped, and visible.", href: "/projects" },
          { title: "Tasks", body: "Quick capture, status updates, and due dates.", href: "/tasks" },
          { title: "Notes", body: "Markdown-first notes with tags and focus.", href: "/notes" },
          { title: "Knowledge", body: "Persona + Soul anchors for alignment.", href: "/knowledge" },
          { title: "Dashboard", body: "Spirit/Soul/Body snapshot with action cues.", href: "/dashboard" },
          { title: "Health", body: "Connectivity status for Supabase auth.", href: "/health" },
        ].map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="text-base font-semibold">{card.title}</div>
            <div className="mt-2 text-sm text-slate-500">{card.body}</div>
          </Link>
        ))}
      </section>
    </main>
  );
}
