import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function toDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default async function SopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: sop, error } = await supabase
    .from("sop_docs")
    .select("id,title,content_md,status")
    .eq("id", id)
    .single();

  if (error || !sop) {
    return (
      <main className="pt-8">
        <h1 className="text-3xl font-semibold">SOP not found</h1>
        <p className="mt-2 text-sm text-slate-500">Check the URL or return to the list.</p>
      </main>
    );
  }

  const { data: checks } = await supabase
    .from("sop_checks")
    .select("id,step,is_done,due_date")
    .eq("sop_id", id)
    .order("created_at", { ascending: true });

  return (
    <main className="pt-8">
      <h1 className="text-3xl font-semibold">{sop.title}</h1>
      <p className="mt-1 text-sm text-slate-500">Status: {sop.status}</p>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">SOP Content</h2>
        <form className="mt-3 grid gap-3" action="/sops/update" method="post">
          <input type="hidden" name="id" value={sop.id} />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" defaultValue={sop.title} required />
          <textarea className="min-h-[220px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm" name="content_md" defaultValue={sop.content_md || ""} />
          <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="status" defaultValue={sop.status || "active"}>
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="archived">archived</option>
          </select>
          <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Save SOP
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">Checklist</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-3" action="/sops/steps" method="post">
          <input type="hidden" name="sop_id" value={sop.id} />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 md:col-span-2" name="step" placeholder="Checklist step" required />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="due_date" type="date" />
          <button className="md:col-span-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Add Step
          </button>
        </form>

        <div className="mt-4 grid gap-2">
          {(checks || []).map((check) => (
            <form key={check.id} action="/sops/steps/toggle" method="post" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <input type="hidden" name="id" value={check.id} />
              <div className="text-sm">{check.step}</div>
              <div className="text-xs text-slate-500">Due: {check.due_date || "n/a"}</div>
              <button className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs" type="submit">
                {check.is_done ? "Done" : "Mark done"}
              </button>
            </form>
          ))}
          {checks && checks.length === 0 && (
            <div className="text-xs text-slate-500">No checklist steps yet.</div>
          )}
        </div>
      </section>
    </main>
  );
}
