import { supabaseServer } from '@/lib/supabase/server';
import PracticeTracker, { SpiritScorePanel } from '@/components/spirit/PracticeTracker';
import {
  summarisePractices,
  pillarPracticeScore,
  surveyPracticeGap,
  todayIso,
  DEFAULT_WINDOW_DAYS,
  type Practice,
  type PracticeLog,
} from '@/lib/spirit/practices';
import { computePillarScores } from '@/lib/flourishing/spirit-soul-body';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Spirit | Mission Control' };

export default async function SpiritPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const today = todayIso();
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - (DEFAULT_WINDOW_DAYS - 1));
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const [{ data: practices }, { data: logs }, { data: profile }] = await Promise.all([
    supabase
      .from('practices')
      .select('id, key, label, description, cadence, target_per_period, icon, sort_order, created_at')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('sort_order'),
    supabase
      .from('practice_logs')
      .select('practice_id, log_date, completed')
      .eq('user_id', user.id)
      .gte('log_date', windowStartIso),
    supabase
      .from('flourishing_profiles')
      .select('domain_scores, updated_at')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const practiceList = (practices ?? []) as Practice[];
  const logList = (logs ?? []) as PracticeLog[];

  const summaries = summarisePractices(practiceList, logList, { today });
  const practiceScore = pillarPracticeScore(summaries);

  const domainScores = (profile?.domain_scores ?? []).map(
    (d: { domain: string; score: number | null }) => ({ domain: d.domain, score: d.score })
  );
  const surveyScore =
    computePillarScores(domainScores).find((p) => p.pillar === 'spirit')?.score ?? null;

  const { reading } = surveyPracticeGap(surveyScore, practiceScore);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-1">
      <div>
        <h1 className="text-3xl font-semibold">Spirit</h1>
        <p className="mt-1 text-sm text-slate-500">
          What the survey says, and what the last {DEFAULT_WINDOW_DAYS} days actually show.
        </p>
      </div>

      <SpiritScorePanel
        surveyScore={surveyScore}
        practiceScore={practiceScore}
        gapReading={reading}
      />

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Today&rsquo;s practices
        </h2>
        {practiceList.length === 0 ? (
          <p className="rounded-2xl border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No practices set up yet.
          </p>
        ) : (
          <PracticeTracker practices={practiceList} logs={logList} today={today} />
        )}
      </div>
    </div>
  );
}
