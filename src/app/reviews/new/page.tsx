import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function toDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default async function ReviewSurveyPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Monthly Review Survey</h1>
        <p className="mt-1 text-sm text-slate-500">
          Capture alignment, score it, and generate corrective actions.
        </p>
      </div>

      <form className="mt-6 grid gap-6" action="/reviews/submit" method="post" data-progress="true" data-toast="Review submitted">
        <input type="hidden" name="period_start" value={periodStart} />

        <section className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">God First</h2>
          <div className="mt-4 grid gap-3">
            <label className="text-sm">1) Consistency in prayer/Scripture (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="god_prayer" type="number" min="1" max="10" required />
            <label className="text-sm">2) Quick to repent and realign (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="god_realign" type="number" min="1" max="10" required />
            <label className="text-sm">3) Idol detected (text)</label>
            <textarea className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="god_idol" />
            <label className="text-sm">4) Obedience prompt (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="god_obedience" type="number" min="1" max="10" required />
          </div>
        </section>

        <section className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">Health</h2>
          <div className="mt-4 grid gap-3">
            <label className="text-sm">5) Training consistency (days/week)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="health_training_days" type="number" min="0" max="7" required />
            <label className="text-sm">6) Nutrition discipline (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="health_nutrition" type="number" min="1" max="10" required />
            <label className="text-sm">7) Sleep/recovery quality (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="health_sleep" type="number" min="1" max="10" required />
            <label className="text-sm">8) Warning signs (text)</label>
            <textarea className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="health_warning" />
          </div>
        </section>

        <section className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">Family</h2>
          <div className="mt-4 grid gap-3">
            <label className="text-sm">9) Mary Jo felt prioritized? (yes/no)</label>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="family_prioritized" defaultValue="yes">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
            <label className="text-sm">9b) Confidence (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="family_prioritized_confidence" type="number" min="1" max="10" required />
            <label className="text-sm">10) Date time count</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="family_date_count" type="number" min="0" max="31" />
            <label className="text-sm">11) Phone/work presence (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="family_presence" type="number" min="1" max="10" required />
            <label className="text-sm">12) Invested in kids/grandkids (text)</label>
            <textarea className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="family_investment" />
          </div>
        </section>

        <section className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">Impact</h2>
          <div className="mt-4 grid gap-3">
            <label className="text-sm">13) Work advanced Kingdom impact (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="impact_kingdom" type="number" min="1" max="10" required />
            <label className="text-sm">14) What did you build that multiplies? (text)</label>
            <textarea className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="impact_multiply" />
            <label className="text-sm">15) Deep work consistency (hours/week)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="impact_deepwork_hours" type="number" min="0" max="80" required />
            <label className="text-sm">16) Teaching/preaching faithfulness (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="impact_teaching" type="number" min="1" max="10" required />
          </div>
        </section>

        <section className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">Stewardship + Focus</h2>
          <div className="mt-4 grid gap-3">
            <label className="text-sm">17) Generous with time/treasure/talent (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="steward_generosity" type="number" min="1" max="10" required />
            <label className="text-sm">18) Avoided ego-driven decisions (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="steward_ego" type="number" min="1" max="10" required />
            <label className="text-sm">19) Honored commitments (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="steward_commitments" type="number" min="1" max="10" required />
            <label className="text-sm">20) Phone/scroll discipline (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="focus_phone" type="number" min="1" max="10" required />
            <label className="text-sm">21) Reading/learning quality (1-10)</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="focus_learning" type="number" min="1" max="10" required />
            <label className="text-sm">22) Anxiety level (1-10) + root cause</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="focus_anxiety" type="number" min="1" max="10" required />
            <textarea className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="focus_anxiety_root" placeholder="Root cause" />
            <label className="text-sm">23) One habit to stop; one to start</label>
            <textarea className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="focus_habits" />
          </div>
        </section>

        <section className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h2 className="text-base font-semibold">Summary Prompts</h2>
          <div className="mt-4 grid gap-3">
            <label className="text-sm">24) What was God teaching you?</label>
            <textarea className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="summary_teaching" />
            <label className="text-sm">25) What must change next month?</label>
            <textarea className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="summary_change" />
            <label className="text-sm">26) Keystone habit for next month</label>
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="summary_keystone" />
            <label className="text-sm">27) Top 3 priorities next month (ranked)</label>
            <textarea className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="summary_priorities" />
          </div>
        </section>

        <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
          Submit Review
        </button>
      </form>
    </main>
  );
}
