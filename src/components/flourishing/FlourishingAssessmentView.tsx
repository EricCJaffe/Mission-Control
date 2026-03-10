'use client';

import { useMemo } from 'react';
import { Radar, RadarChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { BookHeart, Brain, BriefcaseBusiness, Cross, HeartHandshake, Sparkles, Target } from 'lucide-react';
import type { FlourishingAssessmentResult } from '@/lib/flourishing/types';
import { DOMAIN_COLORS } from '@/lib/flourishing/types';

const DOMAIN_ICONS = {
  relational: HeartHandshake,
  mental_emotional: Brain,
  physical_brain: Sparkles,
  work_money_time: BriefcaseBusiness,
  meaning_purpose_calling: Target,
  faith_spiritual: Cross,
};

function scoreTone(score: number) {
  if (score >= 8) return 'text-emerald-700';
  if (score >= 6) return 'text-blue-700';
  return 'text-rose-700';
}

export default function FlourishingAssessmentView({
  assessment,
  history = [],
}: {
  assessment: FlourishingAssessmentResult;
  history?: FlourishingAssessmentResult[];
}) {
  const radarData = useMemo(() => assessment.domain_scores.map((score) => ({
    domain: score.label.replace(' & ', ' / '),
    score: score.display_score,
    fullMark: 10,
  })), [assessment.domain_scores]);

  const historyChart = useMemo(() => history.slice().reverse().map((item) => ({
    date: new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    index: item.interpretation.display_index,
  })), [history]);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(251,191,36,0.18),_transparent_38%),radial-gradient(circle_at_bottom_left,_rgba(244,114,182,0.16),_transparent_32%)]" />
        <div className="relative grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-amber-800 ring-1 ring-amber-200">
              Flourishing Index
            </div>
            <div className="mt-4 flex items-end gap-3">
              <div className="text-6xl font-semibold tracking-tight text-slate-900">{assessment.interpretation.display_index}</div>
              <div className="pb-2 text-lg text-slate-500">/ 10.0</div>
            </div>
            <p className="mt-3 max-w-2xl text-base text-slate-700">{assessment.interpretation.overall_message}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-200">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Previous</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{assessment.interpretation.previous_index ?? '—'}</div>
              </div>
              <div className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-200">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Delta</div>
                <div className={`mt-2 text-2xl font-semibold ${scoreTone((assessment.interpretation.delta_from_previous ?? 0) + 7)}`}>
                  {assessment.interpretation.delta_from_previous != null ? `${assessment.interpretation.delta_from_previous > 0 ? '+' : ''}${assessment.interpretation.delta_from_previous}` : '—'}
                </div>
              </div>
              <div className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-200">
                <div className="text-xs uppercase tracking-[0.22em] text-slate-500">90-Day Avg</div>
                <div className="mt-2 text-2xl font-semibold text-slate-900">{assessment.interpretation.average_90d ?? '—'}</div>
              </div>
            </div>
          </div>
          <div className="rounded-[24px] bg-white/85 p-4 ring-1 ring-slate-200">
            <div className="mb-3 text-sm font-semibold text-slate-700">Domain Shape</div>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#cbd5e1" />
                <PolarAngleAxis dataKey="domain" tick={{ fill: '#334155', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 10]} tick={{ fill: '#64748b', fontSize: 10 }} />
                <Radar name="Score" dataKey="score" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.38} />
                <RechartsTooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {historyChart.length > 1 && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">
            <BookHeart className="h-4 w-4" /> Trend
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis domain={[0, 10]} stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="index" stroke="#0f172a" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {assessment.domain_scores.map((domain) => {
          const Icon = DOMAIN_ICONS[domain.domain];
          const colors = DOMAIN_COLORS[domain.domain];
          const coaching = assessment.coaching.domain_coaching.find((item) => item.domain === domain.domain);
          return (
            <article key={domain.domain} className={`rounded-[26px] border border-slate-200 bg-gradient-to-br ${colors.panel} p-5 shadow-sm`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={`inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${colors.text}`}>
                    <Icon className="h-4 w-4" /> {domain.label}
                  </div>
                  <div className="mt-3 text-4xl font-semibold text-slate-900">{domain.display_score}</div>
                </div>
                <div className="rounded-2xl bg-white/80 px-3 py-2 text-right ring-1 ring-slate-200">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Delta</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">
                    {domain.delta_from_previous != null ? `${domain.delta_from_previous > 0 ? '+' : ''}${domain.delta_from_previous}` : '—'}
                  </div>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-700">{domain.summary}</p>
              {coaching && (
                <div className="mt-4 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">AI Insight</div>
                  <p className="mt-2 text-sm text-slate-700">{coaching.insight_summary}</p>
                  {coaching.current_data_points.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-slate-600">
                      {coaching.current_data_points.map((point) => (
                        <li key={point}>• {point}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="font-medium text-slate-900">Growth edge:</span> {coaching.growth_focus}
                  </div>
                </div>
              )}
              {domain.scripture && (
                <div className="mt-4 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Scripture</div>
                  <div className="mt-2 text-sm font-medium text-slate-800">{domain.scripture.reference}</div>
                  <p className="mt-1 text-sm text-slate-600">{domain.scripture.text}</p>
                </div>
              )}
              {domain.tips && domain.tips.length > 0 && (
                <div className="mt-4 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Immediate Actions</div>
                  <ul className="mt-2 space-y-2 text-sm text-slate-700">
                    {domain.tips.map((tip) => (
                      <li key={tip}>• {tip}</li>
                    ))}
                  </ul>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Coaching Summary</div>
        <p className="mt-3 text-base text-slate-700">{assessment.coaching.narrative_summary}</p>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {assessment.coaching.domain_coaching.map((coaching) => (
            <div key={coaching.domain} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="text-base font-semibold text-slate-900">{assessment.domain_scores.find((item) => item.domain === coaching.domain)?.label ?? coaching.domain}</div>
              <p className="mt-2 text-sm text-slate-700">{coaching.encouraging_statement}</p>
              <p className="mt-3 text-sm text-slate-600">{coaching.insight_summary}</p>
              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Reflection Questions</div>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {coaching.reflection_questions.map((question) => <li key={question}>• {question}</li>)}
              </ul>
              <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Journaling Prompts</div>
              <ul className="mt-2 space-y-2 text-sm text-slate-700">
                {coaching.journaling_prompts.map((prompt) => <li key={prompt}>• {prompt}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
