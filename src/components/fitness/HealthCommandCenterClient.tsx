'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Brain, ClipboardPlus, Download, FileHeart, FlaskConical, Loader2, Pill, RefreshCw, Sparkles } from 'lucide-react';

type Snapshot = {
  pending_updates: { count: number };
  medications: {
    total: number;
    medications: Array<{ name: string; type: string; timing: string | null }>;
    supplements: Array<{ name: string; type: string; timing: string | null }>;
  };
  labs: {
    confirmed_panels: number;
    latest_panel_date: string | null;
    abnormal_results: string[];
  };
  genetics: {
    completed_reports: Array<{ file_name: string; file_type: string; processed_at: string | null }>;
    comprehensive_analysis: Record<string, unknown> | null;
  };
  imaging: Array<{ file_name: string; created_at: string; summary: string; impression: string | null }>;
  metrics: {
    latest_weight_lbs: number | null;
    avg_resting_hr_7d: number | null;
    avg_hrv_7d: number | null;
    avg_sleep_hours_7d: number | null;
    latest_bp_avg_30d: { systolic: number; diastolic: number } | null;
    readiness: { score: number | null; label: string | null };
    strain: { score: number | null; level: string | null };
    form: { tsb: number | null; status: string | null; ctl: number | null; atl: number | null };
  };
  training: {
    active_plan: { id: string; name: string; goal: string | null; start_date: string; end_date: string } | null;
    last_workout: { date: string; type: string; duration_minutes: number | null; tss: number | null } | null;
    ninety_day_summary: {
      total_workouts: number;
      avg_sessions_per_week: number;
      avg_duration_minutes: number;
      avg_tss: number;
      workout_type_distribution: Record<string, number>;
    };
  };
};

type SuggestedUpdate = {
  section_number: number;
  section_name: string;
  current_content: string;
  proposed_content: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  priority: number;
};

type Analysis = {
  executive_summary: string;
  top_priorities: string[];
  what_is_working: string[];
  risks_to_watch: string[];
  cross_domain_connections: string[];
  doctor_conversation_topics: string[];
  open_questions_for_user: string[];
  training_direction: {
    overall_recommendation: string;
    best_next_block: string;
    rationale: string[];
    guardrails: string[];
  };
  suggested_health_doc_updates: SuggestedUpdate[];
  last_follow_up?: {
    question: string;
    answer: string;
    recommended_plan: {
      goal: string;
      weeks: number;
      sessions_per_week: number;
      focus_areas: string[];
      why: string;
    };
    generated_at: string;
  };
};

type FollowUp = {
  answer: string;
  recommended_plan: {
    goal: string;
    weeks: number;
    sessions_per_week: number;
    focus_areas: string[];
    why: string;
  };
};

type PlanIntake = {
  plan_name: string;
  goal: string;
  primary_objective: string;
  secondary_objectives: string[];
  target_metrics: Array<{
    metric: string;
    current: string;
    target: string;
    why: string;
  }>;
  weekly_framework: Array<{
    day_name: string;
    session_type: string;
    purpose: string;
    duration_min: number;
    notes: string;
  }>;
  day_type_guidance: Array<{
    type: string;
    description: string;
    intensity_guidance: string;
    duration_guidance: string;
    examples: string[];
  }>;
  weekly_tracking: string[];
  schedule_constraints: {
    off_day: string;
    hard_day: string;
    long_day: string;
    allow_double_day: boolean;
    strength_days_per_week: number;
    cardio_days_per_week: number;
    strength_duration_min: number;
    normal_cardio_duration_min: string;
    long_cardio_duration_min: number;
    cardio_modes: string[];
    notes: string;
  };
  notes_for_generation: string;
  generated_at?: string;
};

const QUICK_QUESTIONS = [
  'Build me a 12-week strength block that respects the cardiac picture.',
  'Build me a 12-week cardio block to help lower resting heart rate safely.',
  'How should I balance lifting, cardio, and recovery right now?',
  'What should I ask my cardiologist before increasing training volume?',
];

export default function HealthCommandCenterClient() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [planIntake, setPlanIntake] = useState<PlanIntake | null>(null);
  const [question, setQuestion] = useState('');
  const [runLoading, setRunLoading] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [fieldLoading, setFieldLoading] = useState<string | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planSessions, setPlanSessions] = useState('4');
  const [planStartDate, setPlanStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

  const recommendedPlan = followUp?.recommended_plan || (analysis
    ? {
        goal: analysis.training_direction.best_next_block || 'hybrid',
        weeks: 12,
        sessions_per_week: 4,
        focus_areas: analysis.top_priorities.slice(0, 3),
        why: analysis.training_direction.overall_recommendation,
      }
    : null);

  const snapshotCards = useMemo(() => {
    if (!snapshot) return [];
    return [
      { label: 'Confirmed Lab Panels', value: String(snapshot.labs.confirmed_panels), icon: <FlaskConical className="h-4 w-4" /> },
      { label: 'Genetics Reports', value: String(snapshot.genetics.completed_reports.length), icon: <Brain className="h-4 w-4" /> },
      { label: 'Imaging Reports', value: String(snapshot.imaging.length), icon: <Activity className="h-4 w-4" /> },
      { label: 'Active Meds / Supps', value: `${snapshot.medications.medications.length}/${snapshot.medications.supplements.length}`, icon: <Pill className="h-4 w-4" /> },
      { label: 'Pending health.md Updates', value: String(snapshot.pending_updates.count), icon: <FileHeart className="h-4 w-4" /> },
      { label: 'Avg RHR (7d)', value: snapshot.metrics.avg_resting_hr_7d != null ? String(snapshot.metrics.avg_resting_hr_7d) : '—', icon: <Sparkles className="h-4 w-4" /> },
    ];
  }, [snapshot]);

  useEffect(() => {
    void loadSavedAnalysis();
  }, []);

  async function loadSavedAnalysis() {
    setInitialLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/health/command-center', {
        method: 'GET',
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load saved analysis');
      }
      if (data.found) {
        setSnapshot(data.snapshot);
        setAnalysis(data.analysis);
        setGeneratedAt(data.generated_at || null);
        if (data.analysis?.last_follow_up) {
          setFollowUp(data.analysis.last_follow_up);
          setQuestion(data.analysis.last_follow_up.question || '');
        }
        if (data.analysis?.last_plan_intake) {
          setPlanIntake(normalizePlanIntake(data.analysis.last_plan_intake));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load saved analysis');
    } finally {
      setInitialLoading(false);
    }
  }

  async function runAnalysis() {
    setRunLoading(true);
    setError(null);
    setQueuedMessage(null);
    try {
      const res = await fetch('/api/fitness/health/command-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'analyze' }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to generate comprehensive analysis');
      }
      setSnapshot(data.snapshot);
      setAnalysis(data.analysis);
      setGeneratedAt(data.generated_at || new Date().toISOString());
      setFollowUp(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate comprehensive analysis');
    } finally {
      setRunLoading(false);
    }
  }

  async function askFollowUp(customQuestion?: string) {
    const value = (customQuestion || question).trim();
    if (!value) return;
    setFollowLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/health/command-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'follow_up', question: value }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to answer follow-up question');
      }
      setSnapshot(data.snapshot);
      setFollowUp(data.follow_up);
      setQuestion(value);
      setAnalysis((prev) => prev ? {
        ...prev,
        last_follow_up: {
          question: value,
          ...data.follow_up,
          generated_at: new Date().toISOString(),
        },
      } : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to answer follow-up question');
    } finally {
      setFollowLoading(false);
    }
  }

  async function queueUpdates() {
    if (!analysis?.suggested_health_doc_updates?.length) return;
    setQueueLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/health/command-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'queue_updates',
          updates: analysis.suggested_health_doc_updates,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to queue health.md updates');
      }
      setQueuedMessage(`Queued ${data.queued_count} update(s). Skipped ${data.skipped_count}.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to queue health.md updates');
    } finally {
      setQueueLoading(false);
    }
  }

  async function preparePlanIntake() {
    setIntakeLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/health/command-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'plan_intake',
          question: question || '',
          recommended_plan: recommendedPlan,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to prepare plan intake');
      }
      setSnapshot(data.snapshot);
      setPlanIntake(normalizePlanIntake(data.plan_intake));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to prepare plan intake');
    } finally {
      setIntakeLoading(false);
    }
  }

  async function buildPlan() {
    if (!recommendedPlan || !planIntake) return;
    setPlanLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: planIntake.goal || recommendedPlan.goal,
          weeks: 12,
          start_date: planStartDate,
          sessions_per_week: parseInt(planSessions, 10),
          focus_areas: recommendedPlan.focus_areas || [],
          plan_preferences: {
            plan_name: planIntake.plan_name,
            primary_objective: planIntake.primary_objective,
            secondary_objectives: planIntake.secondary_objectives,
            target_metrics: planIntake.target_metrics,
            weekly_framework: planIntake.weekly_framework,
            day_type_guidance: planIntake.day_type_guidance,
            weekly_tracking: planIntake.weekly_tracking,
            schedule_constraints: planIntake.schedule_constraints,
            strength_duration_min: planIntake.schedule_constraints?.strength_duration_min ?? 45,
            normal_cardio_duration_min: planIntake.schedule_constraints?.normal_cardio_duration_min ?? '45-60',
            long_cardio_duration_min: planIntake.schedule_constraints?.long_cardio_duration_min ?? 90,
            weight_goal_mode: 'secondary_outcome',
          },
          context_notes: [
            analysis?.training_direction?.overall_recommendation,
            followUp?.answer,
            followUp?.recommended_plan?.why,
            planIntake.notes_for_generation,
            question || null,
          ].filter(Boolean).join('\n\n'),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to generate training plan');
      }
      router.push('/fitness/plans');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate training plan');
    } finally {
      setPlanLoading(false);
    }
  }

  async function regenerateIntakeField(field: 'target_metrics' | 'weekly_framework' | 'day_type_guidance' | 'weekly_tracking' | 'schedule_constraints') {
    if (!planIntake) return;
    setFieldLoading(field);
    setError(null);
    try {
      const res = await fetch('/api/fitness/health/command-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'plan_intake_field',
          field,
          question: question || '',
          recommended_plan: recommendedPlan,
          current_intake: planIntake,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Failed to refresh ${field}`);
      }
      setPlanIntake((prev) => prev ? normalizePlanIntake({ ...prev, [field]: data.value }) : prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to refresh ${field}`);
    } finally {
      setFieldLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200">Health Command Center</p>
            <h1 className="mt-2 text-3xl font-semibold">Total health picture across labs, genetics, imaging, training, meds, and recovery</h1>
            <p className="mt-3 text-sm text-slate-300">
              This runs a cross-domain AI synthesis, proposes concrete `health.md` updates, and can seed a 12-week block from the combined picture.
            </p>
            {generatedAt && (
              <p className="mt-3 text-xs text-slate-400">
                Saved analysis loaded. Last generated {new Date(generatedAt).toLocaleString()}.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={runAnalysis}
              disabled={runLoading}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100 disabled:opacity-60"
            >
              {runLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : analysis ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {analysis ? 'Refresh Analysis' : 'Run Full Analysis'}
            </button>
            {analysis && (
              <a
                href="/api/fitness/health/command-center/report"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10"
              >
                <Download className="h-4 w-4" />
                Export PDF
              </a>
            )}
            <Link href="/fitness/health/review-updates" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/10">
              <ClipboardPlus className="h-4 w-4" />
              Review health.md Queue
            </Link>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {queuedMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {queuedMessage}
        </div>
      )}

      {initialLoading ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          <div className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading saved analysis...
          </div>
        </section>
      ) : snapshot && (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {snapshotCards.map((card) => (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {card.icon}
                {card.label}
              </div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{card.value}</div>
            </div>
          ))}
        </section>
      )}

      {analysis ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">AI Executive Summary</h2>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {analysis.executive_summary}
              </div>
            </div>

            <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">Training Direction</h2>
              <p className="mt-3 text-sm leading-7 text-slate-700">{analysis.training_direction.overall_recommendation}</p>
              <div className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Best next block:</span> {analysis.training_direction.best_next_block}
              </div>
              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-900">Guardrails</p>
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  {analysis.training_direction.guardrails.map((item) => (
                    <li key={item} className="rounded-xl bg-white px-3 py-2">{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ListCard title="Top Priorities" items={analysis.top_priorities} />
            <ListCard title="What Is Working" items={analysis.what_is_working} />
            <ListCard title="Risks To Watch" items={analysis.risks_to_watch} />
            <ListCard title="Cross-Domain Connections" items={analysis.cross_domain_connections} />
            <ListCard title="Doctor Conversation Topics" items={analysis.doctor_conversation_topics} />
            <ListCard title="Open Questions For You" items={analysis.open_questions_for_user} />
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Suggested health.md Updates</h2>
                <p className="mt-1 text-sm text-slate-500">
                  These are section-level replacements proposed from the total health picture. Queue them into the normal review page before applying.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={queueUpdates}
                  disabled={queueLoading || analysis.suggested_health_doc_updates.length === 0}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {queueLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardPlus className="h-4 w-4" />}
                  Queue Suggested Updates
                </button>
                <Link href="/fitness/health/review-updates" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Open Review Queue
                </Link>
              </div>
            </div>

            {analysis.suggested_health_doc_updates.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                No new section updates were proposed from this run.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {analysis.suggested_health_doc_updates.map((update) => (
                  <details key={`${update.section_number}-${update.reason}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            §{update.section_number} {update.section_name}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">{update.reason}</p>
                        </div>
                        <div className="flex gap-2 text-xs">
                          <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 border border-slate-200">Priority {update.priority}</span>
                          <span className="rounded-full bg-white px-2.5 py-1 text-slate-700 border border-slate-200">{update.confidence}</span>
                        </div>
                      </div>
                    </summary>
                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current</p>
                        <pre className="mt-2 overflow-x-auto rounded-2xl bg-white p-4 text-xs leading-6 text-slate-700">{update.current_content || 'No current section content found.'}</pre>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proposed</p>
                        <pre className="mt-2 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">{update.proposed_content}</pre>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Run the command center analysis to generate the comprehensive picture.
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Ask a Follow-Up Question</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ask for a strength block, cardio focus, lower RHR strategy, or anything else that should use the combined health picture.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setQuestion(item);
                    askFollowUp(item);
                  }}
                  className="rounded-full border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {item}
                </button>
              ))}
            </div>

            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Example: build me a 12-week hybrid block that lowers resting heart rate without sacrificing strength."
              className="mt-4 min-h-[120px] w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none ring-0 placeholder:text-slate-400 focus:border-slate-500"
            />
            <button
              onClick={() => askFollowUp()}
              disabled={followLoading || !question.trim()}
              className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {followLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Ask AI
            </button>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="text-lg font-semibold text-slate-900">12-Week Block Builder</h3>
            <p className="mt-1 text-sm text-slate-500">
              Uses the combined picture plus your follow-up goal to seed the existing training-plan generator.
            </p>

            {followUp ? (
              <div className="mt-4 rounded-2xl bg-white p-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{followUp.answer}</p>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500">
                Ask a follow-up question first if you want the plan goal auto-tuned.
              </div>
            )}

            {recommendedPlan && (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl bg-white p-4 text-sm text-slate-700">
                  <p><span className="font-semibold text-slate-900">Recommended goal:</span> {recommendedPlan.goal}</p>
                  <p className="mt-2"><span className="font-semibold text-slate-900">Focus areas:</span> {recommendedPlan.focus_areas.join(', ') || 'General balance'}</p>
                  <p className="mt-2"><span className="font-semibold text-slate-900">Why:</span> {recommendedPlan.why}</p>
                </div>

                <label className="block text-sm font-medium text-slate-700">
                  Start date
                  <input
                    type="date"
                    value={planStartDate}
                    onChange={(event) => setPlanStartDate(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  Sessions per week
                  <select
                    value={planSessions}
                    onChange={(event) => setPlanSessions(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900"
                  >
                    {[3, 4, 5, 6].map((count) => (
                      <option key={count} value={count}>{count}</option>
                    ))}
                  </select>
                </label>

                {planIntake?.schedule_constraints && (
                  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
                    <ConstraintField label="Off day" value={planIntake.schedule_constraints.off_day} onChange={(value) => setPlanIntake(prev => prev ? { ...prev, schedule_constraints: { ...prev.schedule_constraints, off_day: value } } : prev)} />
                    <ConstraintField label="Hard cardio day" value={planIntake.schedule_constraints.hard_day} onChange={(value) => setPlanIntake(prev => prev ? { ...prev, schedule_constraints: { ...prev.schedule_constraints, hard_day: value } } : prev)} />
                    <ConstraintField label="Long cardio day" value={planIntake.schedule_constraints.long_day} onChange={(value) => setPlanIntake(prev => prev ? { ...prev, schedule_constraints: { ...prev.schedule_constraints, long_day: value } } : prev)} />
                    <ConstraintField label="Strength days / wk" value={String(planIntake.schedule_constraints.strength_days_per_week)} onChange={(value) => setPlanIntake(prev => prev ? { ...prev, schedule_constraints: { ...prev.schedule_constraints, strength_days_per_week: Number(value) || prev.schedule_constraints.strength_days_per_week } } : prev)} />
                    <ConstraintField label="Cardio days / wk" value={String(planIntake.schedule_constraints.cardio_days_per_week)} onChange={(value) => setPlanIntake(prev => prev ? { ...prev, schedule_constraints: { ...prev.schedule_constraints, cardio_days_per_week: Number(value) || prev.schedule_constraints.cardio_days_per_week } } : prev)} />
                    <ConstraintField label="Cardio modes" value={planIntake.schedule_constraints.cardio_modes.join(', ')} onChange={(value) => setPlanIntake(prev => prev ? { ...prev, schedule_constraints: { ...prev.schedule_constraints, cardio_modes: value.split(',').map(v => v.trim()).filter(Boolean) } } : prev)} />
                  </div>
                )}

                <button
                  onClick={preparePlanIntake}
                  disabled={intakeLoading}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                >
                  {intakeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {planIntake ? 'Refresh Intake Draft' : 'Prepare Plan Intake'}
                </button>

                {planIntake && (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Plan Name</label>
                      <input
                        value={planIntake.plan_name}
                        onChange={(event) => setPlanIntake(prev => prev ? { ...prev, plan_name: event.target.value } : prev)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Primary Objective</label>
                      <textarea
                        value={planIntake.primary_objective}
                        onChange={(event) => setPlanIntake(prev => prev ? { ...prev, primary_objective: event.target.value } : prev)}
                        className="mt-1 min-h-[80px] w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900"
                      />
                    </div>

                    <EditableStringList
                      label="Secondary Objectives"
                      items={planIntake.secondary_objectives}
                      onChange={(items) => setPlanIntake(prev => prev ? { ...prev, secondary_objectives: items } : prev)}
                    />

                    <SectionHeader
                      title="Target Metrics"
                      loading={fieldLoading === 'target_metrics'}
                      onRefresh={() => regenerateIntakeField('target_metrics')}
                    />
                    <EditableMetricList
                      items={planIntake.target_metrics}
                      onChange={(items) => setPlanIntake(prev => prev ? { ...prev, target_metrics: items } : prev)}
                    />

                    <SectionHeader
                      title="Weekly Framework"
                      loading={fieldLoading === 'weekly_framework'}
                      onRefresh={() => regenerateIntakeField('weekly_framework')}
                    />
                    <EditableFrameworkList
                      items={planIntake.weekly_framework}
                      onChange={(items) => setPlanIntake(prev => prev ? { ...prev, weekly_framework: items } : prev)}
                    />

                    <SectionHeader
                      title="Day-Type Guidance"
                      loading={fieldLoading === 'day_type_guidance'}
                      onRefresh={() => regenerateIntakeField('day_type_guidance')}
                    />
                    <EditableDayTypeList
                      items={planIntake.day_type_guidance}
                      onChange={(items) => setPlanIntake(prev => prev ? { ...prev, day_type_guidance: items } : prev)}
                    />

                    <SectionHeader
                      title="Schedule Constraints"
                      loading={fieldLoading === 'schedule_constraints'}
                      onRefresh={() => regenerateIntakeField('schedule_constraints')}
                    />
                    <EditableScheduleConstraints
                      value={planIntake.schedule_constraints}
                      onChange={(value) => setPlanIntake(prev => prev ? { ...prev, schedule_constraints: value } : prev)}
                    />

                    <SectionHeader
                      title="Weekly Tracking"
                      loading={fieldLoading === 'weekly_tracking'}
                      onRefresh={() => regenerateIntakeField('weekly_tracking')}
                    />
                    <EditableStringList
                      label="Weekly Tracking"
                      items={planIntake.weekly_tracking}
                      onChange={(items) => setPlanIntake(prev => prev ? { ...prev, weekly_tracking: items } : prev)}
                    />

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Notes For Generation</label>
                      <textarea
                        value={planIntake.notes_for_generation}
                        onChange={(event) => setPlanIntake(prev => prev ? { ...prev, notes_for_generation: event.target.value } : prev)}
                        className="mt-1 min-h-[100px] w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900"
                      />
                    </div>

                    <button
                      onClick={buildPlan}
                      disabled={planLoading}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {planLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Create Plan From Intake
                    </button>
                  </div>
                )}

                <Link
                  href="/fitness/plans"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-white"
                >
                  View Saved Plans
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function normalizePlanIntake(input: Partial<PlanIntake> | null | undefined): PlanIntake {
  return {
    plan_name: input?.plan_name || '12-Week Training Block',
    goal: input?.goal || 'hybrid',
    primary_objective: input?.primary_objective || '',
    secondary_objectives: Array.isArray(input?.secondary_objectives) ? input.secondary_objectives : [],
    target_metrics: Array.isArray(input?.target_metrics) ? input.target_metrics : [],
    weekly_framework: Array.isArray(input?.weekly_framework) ? input.weekly_framework : [],
    day_type_guidance: Array.isArray(input?.day_type_guidance) ? input.day_type_guidance : [],
    weekly_tracking: Array.isArray(input?.weekly_tracking) ? input.weekly_tracking : [],
    schedule_constraints: {
      off_day: input?.schedule_constraints?.off_day || 'Sunday',
      hard_day: input?.schedule_constraints?.hard_day || 'Thursday',
      long_day: input?.schedule_constraints?.long_day || 'Saturday',
      allow_double_day: input?.schedule_constraints?.allow_double_day ?? true,
      strength_days_per_week: input?.schedule_constraints?.strength_days_per_week || 3,
      cardio_days_per_week: input?.schedule_constraints?.cardio_days_per_week || 4,
      strength_duration_min: input?.schedule_constraints?.strength_duration_min || 45,
      normal_cardio_duration_min: input?.schedule_constraints?.normal_cardio_duration_min || '45-60',
      long_cardio_duration_min: input?.schedule_constraints?.long_cardio_duration_min || 90,
      cardio_modes: Array.isArray(input?.schedule_constraints?.cardio_modes) ? input.schedule_constraints.cardio_modes : ['Treadmill', 'Outdoor', 'Bike'],
      notes: input?.schedule_constraints?.notes || '',
    },
    notes_for_generation: input?.notes_for_generation || '',
    generated_at: input?.generated_at,
  };
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No items returned.</p>
      ) : (
        <ul className="mt-4 space-y-3 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item} className="rounded-2xl bg-slate-50 px-4 py-3 leading-6">{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  loading,
  onRefresh,
}: {
  title: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex min-h-[36px] items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Re-suggest
      </button>
    </div>
  );
}

function ConstraintField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900"
      />
    </label>
  );
}

function EditableStringList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</label>
      <div className="mt-2 space-y-2">
        {items.map((item, index) => (
          <input
            key={`${label}-${index}`}
            value={item}
            onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? event.target.value : current))}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900"
          />
        ))}
      </div>
    </div>
  );
}

function EditableMetricList({
  items,
  onChange,
}: {
  items: PlanIntake['target_metrics'];
  onChange: (items: PlanIntake['target_metrics']) => void;
}) {
  return (
    <div>
      <div className="mt-2 space-y-3">
        {items.map((item, index) => (
          <div key={`metric-${index}`} className="rounded-xl border border-slate-200 p-3">
            <input value={item.metric} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, metric: event.target.value } : current))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <input value={item.current} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, current: event.target.value } : current))} placeholder="Current" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={item.target} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, target: event.target.value } : current))} placeholder="Target" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <textarea value={item.why} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, why: event.target.value } : current))} placeholder="Why this matters" className="mt-2 min-h-[70px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableFrameworkList({
  items,
  onChange,
}: {
  items: PlanIntake['weekly_framework'];
  onChange: (items: PlanIntake['weekly_framework']) => void;
}) {
  return (
    <div>
      <div className="mt-2 space-y-3">
        {items.map((item, index) => (
          <div key={`framework-${index}`} className="rounded-xl border border-slate-200 p-3">
            <div className="grid gap-2 md:grid-cols-2">
              <input value={item.day_name} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, day_name: event.target.value } : current))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={item.session_type} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, session_type: event.target.value } : current))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <input value={String(item.duration_min)} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, duration_min: Number(event.target.value) || current.duration_min } : current))} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <textarea value={item.purpose} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, purpose: event.target.value } : current))} className="mt-2 min-h-[70px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <textarea value={item.notes} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, notes: event.target.value } : current))} className="mt-2 min-h-[60px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableDayTypeList({
  items,
  onChange,
}: {
  items: PlanIntake['day_type_guidance'];
  onChange: (items: PlanIntake['day_type_guidance']) => void;
}) {
  return (
    <div>
      <div className="mt-2 space-y-3">
        {items.map((item, index) => (
          <div key={`day-type-${index}`} className="rounded-xl border border-slate-200 p-3">
            <input value={item.type} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, type: event.target.value } : current))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <textarea value={item.description} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, description: event.target.value } : current))} className="mt-2 min-h-[70px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={item.intensity_guidance} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, intensity_guidance: event.target.value } : current))} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={item.duration_guidance} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, duration_guidance: event.target.value } : current))} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={item.examples.join(', ')} onChange={(event) => onChange(items.map((current, currentIndex) => currentIndex === index ? { ...current, examples: event.target.value.split(',').map(v => v.trim()).filter(Boolean) } : current))} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EditableScheduleConstraints({
  value,
  onChange,
}: {
  value: PlanIntake['schedule_constraints'];
  onChange: (value: PlanIntake['schedule_constraints']) => void;
}) {
  return (
    <div className="mt-2 rounded-xl border border-slate-200 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <input value={value.off_day} onChange={(event) => onChange({ ...value, off_day: event.target.value })} placeholder="Off day" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input value={value.hard_day} onChange={(event) => onChange({ ...value, hard_day: event.target.value })} placeholder="Hard cardio day" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input value={value.long_day} onChange={(event) => onChange({ ...value, long_day: event.target.value })} placeholder="Long cardio day" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input value={String(value.strength_days_per_week)} onChange={(event) => onChange({ ...value, strength_days_per_week: Number(event.target.value) || value.strength_days_per_week })} placeholder="Strength days per week" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input value={String(value.cardio_days_per_week)} onChange={(event) => onChange({ ...value, cardio_days_per_week: Number(event.target.value) || value.cardio_days_per_week })} placeholder="Cardio days per week" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input value={String(value.strength_duration_min)} onChange={(event) => onChange({ ...value, strength_duration_min: Number(event.target.value) || value.strength_duration_min })} placeholder="Strength duration" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input value={value.normal_cardio_duration_min} onChange={(event) => onChange({ ...value, normal_cardio_duration_min: event.target.value })} placeholder="Normal cardio duration" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input value={String(value.long_cardio_duration_min)} onChange={(event) => onChange({ ...value, long_cardio_duration_min: Number(event.target.value) || value.long_cardio_duration_min })} placeholder="Long cardio duration" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input value={value.cardio_modes.join(', ')} onChange={(event) => onChange({ ...value, cardio_modes: event.target.value.split(',').map(v => v.trim()).filter(Boolean) })} placeholder="Cardio modes" className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={value.allow_double_day} onChange={(event) => onChange({ ...value, allow_double_day: event.target.checked })} />
        Allow one double-up day when needed
      </label>
      <textarea value={value.notes} onChange={(event) => onChange({ ...value, notes: event.target.value })} placeholder="Scheduling notes" className="mt-3 min-h-[80px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
  );
}
