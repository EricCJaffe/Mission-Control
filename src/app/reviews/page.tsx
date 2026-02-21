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

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Reviews</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monthly reviews and alignment status.
        </p>
      </div>

      <div className="mt-4">
        <a className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" href="/reviews/new">
          Run Monthly Survey
        </a>
      </div>

      <section className="mt-6 grid gap-3">
        {(reviews || []).map((review) => (
          <div key={review.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
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
          </div>
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
