import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: scoreRow } = await supabase
    .from("dashboard_scores")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: reviews } = await supabase
    .from("monthly_reviews")
    .select("id,period_start,alignment_score,alignment_status,drift_flags")
    .order("period_start", { ascending: false })
    .limit(6);

  const { data: scoreHistory } = await supabase
    .from("dashboard_scores")
    .select("id,created_at,spirit,soul,body")
    .order("created_at", { ascending: false })
    .limit(12);

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Metrics</h1>
        <p className="mt-1 text-sm text-slate-500">Non-vanity scorecard across Spirit, Soul, Body.</p>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-widest text-slate-500">Spirit</div>
          <div className="mt-2 text-3xl font-semibold">{scoreRow?.spirit ?? "—"}</div>
          <div className="mt-1 text-xs text-slate-500">{scoreRow?.spirit_alignment || "No note yet."}</div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-widest text-slate-500">Soul</div>
          <div className="mt-2 text-3xl font-semibold">{scoreRow?.soul ?? "—"}</div>
          <div className="mt-1 text-xs text-slate-500">{scoreRow?.soul_alignment || "No note yet."}</div>
        </div>
        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-widest text-slate-500">Body</div>
          <div className="mt-2 text-3xl font-semibold">{scoreRow?.body ?? "—"}</div>
          <div className="mt-1 text-xs text-slate-500">{scoreRow?.body_alignment || "No note yet."}</div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">Spirit / Soul / Body Trend</h2>
        <p className="mt-1 text-xs text-slate-500">Last 12 snapshots.</p>
        {(() => {
          const latestRow = (scoreHistory || [])[0] as any;
          return (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            { label: "Spirit", key: "spirit", color: "bg-blue-600" },
            { label: "Soul", key: "soul", color: "bg-emerald-600" },
            { label: "Body", key: "body", color: "bg-amber-500" },
          ].map((metric) => (
            <div key={metric.key} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-sm font-semibold">{metric.label}</div>
              <div className="mt-2 flex h-16 items-end gap-1">
                {(scoreHistory || []).slice().reverse().map((row) => {
                  const value = Number((row as any)[metric.key] ?? 0);
                  const height = Math.max(4, Math.min(100, (value / 10) * 100));
                  return (
                    <div
                      key={`${metric.key}-${row.id}`}
                      className={`w-2 rounded-t ${metric.color}`}
                      style={{ height: `${height}%` }}
                      title={`${value}`}
                    />
                  );
                })}
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Latest: {latestRow ? latestRow[metric.key] ?? "—" : "—"}
              </div>
            </div>
          ))}
        </div>
          );
        })()}
      </section>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">Recent Monthly Alignment</h2>
        <div className="mt-4 grid gap-2 text-sm">
          {(reviews || []).map((review) => (
            <div key={review.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="font-semibold">{review.period_start}</div>
              <div className="mt-1 text-xs text-slate-500">
                Score: {review.alignment_score ?? "n/a"} · Status: {review.alignment_status || "auto"}
              </div>
              {review.drift_flags && review.drift_flags.length > 0 && (
                <div className="mt-1 text-xs text-slate-600">Flags: {review.drift_flags.join(", ")}</div>
              )}
            </div>
          ))}
          {reviews && reviews.length === 0 && (
            <div className="text-xs text-slate-500">No reviews yet.</div>
          )}
        </div>
      </section>
    </main>
  );
}
