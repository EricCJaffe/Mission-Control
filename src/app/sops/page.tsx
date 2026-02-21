import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BJJ_TEMPLATE = `# 12-Week BJJ Performance Plan (Template)

## Purpose
- Optimize BJJ performance while maintaining fat loss, strength, cardio, and health goals.
- Includes mobility work for flexibility and injury prevention.

## Structure
- 3 cardio sessions/week (Zone 2 + BJJ)
- 3 strength sessions/week
- Mobility before and after strength/BJJ sessions

## Notes
- Adjust volume if fatigued.
- Keep alignment with Spirit, Soul, Body priorities.
`;

export default async function SopsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: sops } = await supabase
    .from("sop_docs")
    .select("id,title,status,updated_at")
    .order("updated_at", { ascending: false });

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">SOPs</h1>
        <p className="mt-1 text-sm text-slate-500">
          Living docs with checklist steps and status prompts.
        </p>
      </div>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">Create SOP</h2>
        <form className="mt-3 grid gap-3" action="/sops/new" method="post">
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="SOP title" required />
          <textarea className="min-h-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm" name="content_md" placeholder="SOP content (markdown)" defaultValue={BJJ_TEMPLATE} />
          <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Save SOP
          </button>
        </form>
      </section>

      <section className="mt-6 grid gap-3">
        {(sops || []).map((sop) => (
          <Link key={sop.id} href={`/sops/${sop.id}`} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <div className="text-base font-semibold">{sop.title}</div>
            <div className="mt-1 text-xs text-slate-500">Status: {sop.status}</div>
          </Link>
        ))}
        {sops && sops.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
            No SOPs yet. Create your first living doc above.
          </div>
        )}
      </section>
    </main>
  );
}
