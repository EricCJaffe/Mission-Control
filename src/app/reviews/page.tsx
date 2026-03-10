import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: reviews } = await supabase
    .from("monthly_reviews")
    .select("id,period_start,period_end,alignment_score,alignment_status,drift_flags")
    .order("period_start", { ascending: false });

  const { data: flourishing } = await supabase
    .from("flourishing_profiles")
    .select("display_index,strongest_domains,growth_domains,updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Reviews</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monthly reviews and alignment status.
        </p>
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" href="/reviews/new">
            Run Monthly Survey
          </Link>
          <Link className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-sm" href="/flourishing">
            Run Flourishing Assessment
          </Link>
          <Link className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" href="/reviews/quarterly">
            Quarterly Template
          </Link>
          <Link className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" href="/reviews/annual">
            Annual Template
          </Link>
        </div>
      </div>

      <section className="mt-6 rounded-[28px] border border-amber-100 bg-gradient-to-br from-rose-50 via-amber-50 to-sky-50 p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-amber-700">Flourishing</div>
            <h2 className="mt-2 text-2xl font-semibold">Whole-life review companion</h2>
            <p className="mt-1 text-sm text-slate-600">
              Run this alongside monthly reviews to track spiritual, relational, stewardship, and calling health over time.
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-right">
            <div className="text-xs uppercase tracking-wide text-slate-500">Current Index</div>
            <div className="mt-1 text-3xl font-semibold text-slate-900">{flourishing?.display_index ?? "—"}</div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Strongest domains</div>
            <div className="mt-2">{flourishing?.strongest_domains?.join(", ") || "No flourishing history yet."}</div>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-900">Growth domains</div>
            <div className="mt-2">{flourishing?.growth_domains?.join(", ") || "No flourishing history yet."}</div>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-3">
        {(reviews || []).map((review) => (
          <Link key={review.id} href={`/reviews/${review.id}`} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:border-slate-300">
            <div className="text-sm uppercase tracking-widest text-slate-500">Monthly Review</div>
            <div className="text-base font-semibold">
              {review.period_start} → {review.period_end}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Alignment score: {review.alignment_score ?? "n/a"} · Status: {review.alignment_status || "auto"}
            </div>
            {review.drift_flags && review.drift_flags.length > 0 && (
              <div className="mt-2 text-xs text-slate-600">Drift flags: {review.drift_flags.join(", ")}</div>
            )}
          </Link>
        ))}
        {reviews && reviews.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
            No reviews yet. Update alignment on the dashboard to create one.
          </div>
        )}
      </section>
    </main>
  );
}
