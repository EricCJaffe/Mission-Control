import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Survey = Record<string, string | undefined>;

function section(label: string, fields: Array<{ key: keyof Survey; label: string }>, survey: Survey) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold">{label}</h2>
      <div className="mt-4 grid gap-3 text-sm">
        {fields.map((field) => (
          <div key={String(field.key)}>
            <div className="text-xs uppercase tracking-wide text-slate-500">{field.label}</div>
            <div className="mt-1 text-slate-700">{survey[field.key] || "—"}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function buildAutoActions(survey: Survey) {
  const tasks: string[] = [];
  const phone = Number(survey.focus_phone || "");
  const training = Number(survey.health_training_days || "");
  const deepWork = Number(survey.impact_deepwork_hours || "");
  const idol = (survey.god_idol || "").trim();
  const prioritized = (survey.family_prioritized || "yes") === "yes";
  if (!Number.isNaN(phone) && phone < 6) tasks.push("Digital Sabbath plan (phone discipline reset)");
  if (!prioritized) tasks.push("Plan date night and write a connection note");
  if (!Number.isNaN(training) && training < 3) tasks.push("Schedule 3 training blocks for next week");
  if (!Number.isNaN(deepWork) && deepWork < 5) tasks.push("Block 3x 90-min deep work sessions");
  if (idol) tasks.push(`Reflection + Scripture meditation on: ${idol}`);
  return tasks;
}

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: review } = await supabase
    .from("monthly_reviews")
    .select("id,period_start,period_end,alignment_score,alignment_status,drift_flags,survey")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!review) {
    return (
      <main className="pt-4 md:pt-8">
        <h1 className="text-3xl font-semibold">Review not found</h1>
      </main>
    );
  }

  const survey = (review.survey || {}) as Survey;
  const autoActions = buildAutoActions(survey);

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500">Monthly Review</div>
          <h1 className="text-3xl font-semibold">
            {review.period_start} → {review.period_end}
          </h1>
          <div className="mt-1 text-sm text-slate-500">
            Alignment score: {review.alignment_score ?? "n/a"} · Status: {review.alignment_status || "auto"}
          </div>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" href="/reviews">
            Back to Reviews
          </Link>
          <form action="/dashboard/events" method="post" data-toast="Calendar event created">
            <input type="hidden" name="date" value={review.period_start} />
            <input type="hidden" name="title" value={`Monthly Review: ${review.period_start}`} />
            <input type="hidden" name="event_type" value="Monthly Review" />
            <input type="hidden" name="start_at" value="09:00" />
            <input type="hidden" name="end_at" value="10:30" />
            <input type="hidden" name="review_id" value={review.id} />
            <input type="hidden" name="redirect" value="calendar" />
            <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white shadow-sm" type="submit">
              Add to Calendar
            </button>
          </form>
        </div>
      </div>

      {review.drift_flags && review.drift_flags.length > 0 && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Drift flags: {review.drift_flags.join(", ")}
        </div>
      )}

      {autoActions.length > 0 && (
        <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold">Auto-actions triggered</h2>
          <ul className="mt-3 grid gap-2 text-sm text-slate-700">
            {autoActions.map((item) => (
              <li key={item} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {section(
          "God First",
          [
            { key: "god_prayer", label: "Consistency in prayer/Scripture" },
            { key: "god_realign", label: "Quick to repent and realign" },
            { key: "god_idol", label: "Idol detected" },
            { key: "god_obedience", label: "Obedience prompt" },
          ],
          survey
        )}
        {section(
          "Health",
          [
            { key: "health_training_days", label: "Training consistency (days/week)" },
            { key: "health_nutrition", label: "Nutrition discipline" },
            { key: "health_sleep", label: "Sleep/recovery quality" },
            { key: "health_warning", label: "Warning signs" },
          ],
          survey
        )}
        {section(
          "Family",
          [
            { key: "family_prioritized", label: "Mary Jo felt prioritized?" },
            { key: "family_prioritized_confidence", label: "Confidence" },
            { key: "family_date_count", label: "Date time count" },
            { key: "family_presence", label: "Phone/work presence" },
            { key: "family_investment", label: "Invested in kids/grandkids" },
          ],
          survey
        )}
        {section(
          "Impact",
          [
            { key: "impact_kingdom", label: "Work advanced Kingdom impact" },
            { key: "impact_multiply", label: "What did you build that multiplies?" },
            { key: "impact_deepwork_hours", label: "Deep work consistency (hours/week)" },
            { key: "impact_teaching", label: "Teaching/preaching faithfulness" },
          ],
          survey
        )}
        {section(
          "Stewardship + Focus",
          [
            { key: "steward_generosity", label: "Generous with time/treasure/talent" },
            { key: "steward_ego", label: "Avoided ego-driven decisions" },
            { key: "steward_commitments", label: "Honored commitments" },
            { key: "focus_phone", label: "Phone/scroll discipline" },
            { key: "focus_learning", label: "Reading/learning quality" },
            { key: "focus_anxiety", label: "Anxiety level" },
            { key: "focus_anxiety_root", label: "Anxiety root cause" },
            { key: "focus_habits", label: "Habit to stop/start" },
          ],
          survey
        )}
        {section(
          "Summary Prompts",
          [
            { key: "summary_teaching", label: "What was God teaching you?" },
            { key: "summary_change", label: "What must change next month?" },
            { key: "summary_keystone", label: "Keystone habit" },
            { key: "summary_priorities", label: "Top 3 priorities next month" },
          ],
          survey
        )}
      </div>
    </main>
  );
}
