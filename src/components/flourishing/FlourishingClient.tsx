'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowRight, Compass, Cross, Loader2, PlusCircle, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import type { AssessmentQuestion, FlourishingAssessmentResult, FlourishingProfile } from '@/lib/flourishing/types';
import { DOMAIN_COLORS } from '@/lib/flourishing/types';
import FlourishingAssessmentView from './FlourishingAssessmentView';

const DOMAIN_INTROS = [
  { domain: 'relational', title: 'Relational Health', subtitle: 'Connections, repair, presence, and support.' },
  { domain: 'mental_emotional', title: 'Mental & Emotional Health', subtitle: 'Peace, resilience, thought life, and emotional steadiness.' },
  { domain: 'physical_brain', title: 'Physical & Brain Health', subtitle: 'Energy, stewardship, recovery, and cognitive clarity.' },
  { domain: 'work_money_time', title: 'Work, Money & Time Stewardship', subtitle: 'Margin, stewardship, focused work, and wise allocation.' },
  { domain: 'meaning_purpose_calling', title: 'Meaning, Purpose & Calling', subtitle: 'Direction, contribution, mission, and season clarity.' },
  { domain: 'faith_spiritual', title: 'Faith & Spiritual Life', subtitle: 'Abiding, prayer, Scripture, obedience, and spiritual alertness.' },
  { domain: 'overall_wellbeing', title: 'Overall Well-Being', subtitle: 'General coherence, hope, flourishing, and joy.' },
] as const;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function FlourishingClient({
  questions,
  currentProfile,
  latestAssessment,
  history,
  pendingPersonaProposals,
}: {
  questions: AssessmentQuestion[];
  currentProfile: FlourishingProfile | null;
  latestAssessment: FlourishingAssessmentResult | null;
  history: FlourishingAssessmentResult[];
  pendingPersonaProposals: Array<{
    id: string;
    section_label: string;
    current_content: string;
    proposed_content: string;
    reason: string;
    confidence: string;
  }>;
}) {
  const [responses, setResponses] = useState<Record<string, number>>(
    () => Object.fromEntries(questions.map((question) => [question.question_id, 5]))
  );
  const [assessmentType, setAssessmentType] = useState<'monthly' | 'adhoc'>('monthly');
  const [activeTab, setActiveTab] = useState<'overview' | 'assess' | 'history' | 'persona'>('overview');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<FlourishingAssessmentResult | null>(latestAssessment);
  const [proposalRows, setProposalRows] = useState(pendingPersonaProposals);
  const [selectedAssessment, setSelectedAssessment] = useState<FlourishingAssessmentResult | null>(latestAssessment);

  const groupedQuestions = useMemo(() => DOMAIN_INTROS.map((section) => ({
    ...section,
    questions: questions.filter((question) => question.domain === section.domain).sort((a, b) => a.order - b.order),
  })), [questions]);

  async function submitAssessment() {
    setSubmitting(true);
    try {
      const res = await fetch('/api/flourishing/assessments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessment_type: assessmentType, responses }),
      });
      const data = await res.json();
      if (!data.ok) {
        alert(data.error || 'Failed to submit flourishing assessment');
        return;
      }
      setResult(data.assessment);
      setSelectedAssessment(data.assessment);
      setActiveTab('overview');
      if (data.pending_persona_proposals) {
        const current = await fetch('/api/flourishing/current').then((response) => response.json());
        setProposalRows(current.pending_persona_proposals || []);
      }
    } catch (error) {
      console.error(error);
      alert('Failed to submit flourishing assessment');
    } finally {
      setSubmitting(false);
    }
  }

  async function applyProposal(action: 'apply' | 'reject', ids: string[]) {
    const route = action === 'apply' ? '/api/flourishing/persona-proposals/apply' : '/api/flourishing/persona-proposals/reject';
    const res = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proposal_ids: ids }),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error || `Failed to ${action} persona proposals`);
      return;
    }
    setProposalRows((prev) => prev.filter((item) => !ids.includes(item.id)));
  }

  const overviewAssessment = selectedAssessment || result || latestAssessment;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-rose-50 via-amber-50 to-sky-50 p-6 shadow-sm">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(251,146,60,0.22),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(96,165,250,0.18),_transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-700 ring-1 ring-slate-200">
              <Sparkles className="h-4 w-4 text-amber-500" /> Flourishing
            </div>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">A brighter view of how life is actually going.</h1>
            <p className="mt-3 max-w-2xl text-base text-slate-700">
              This assessment blends spiritual, relational, emotional, physical, stewardship, and calling awareness into one review-centered snapshot. It reads from your persona and health context, then proposes refined updates rather than overwriting them silently.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => { setAssessmentType('monthly'); setActiveTab('assess'); }} className="rounded-2xl bg-slate-900 px-5 py-4 text-left text-white shadow-sm transition hover:bg-slate-800">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-300">Primary</div>
              <div className="mt-2 text-lg font-semibold">Run Monthly Assessment</div>
            </button>
            <button onClick={() => { setAssessmentType('adhoc'); setActiveTab('assess'); }} className="rounded-2xl bg-white px-5 py-4 text-left text-slate-900 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Flexible</div>
              <div className="mt-2 text-lg font-semibold">Run Ad Hoc Check-In</div>
            </button>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview', label: 'Overview', icon: Compass },
          { id: 'assess', label: 'Take Assessment', icon: PlusCircle },
          { id: 'history', label: 'History', icon: TrendingUp },
          { id: 'persona', label: 'Persona Proposals', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${activeTab === tab.id ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300'}`}
            >
              <Icon className="h-4 w-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Current Index</div>
              <div className="mt-3 text-4xl font-semibold text-slate-900">{currentProfile?.display_index ?? '—'}</div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Strongest Domains</div>
              <div className="mt-3 text-sm text-slate-700">{currentProfile?.strongest_domains?.join(', ') || 'No assessment yet'}</div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Growth Domains</div>
              <div className="mt-3 text-sm text-slate-700">{currentProfile?.growth_domains?.join(', ') || 'No assessment yet'}</div>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Persona Proposals</div>
              <div className="mt-3 text-4xl font-semibold text-slate-900">{proposalRows.length}</div>
            </div>
          </section>

          {!overviewAssessment ? (
            <section className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 p-10 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Cross className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-2xl font-semibold text-slate-900">No flourishing assessment yet</h2>
              <p className="mt-2 text-slate-600">Start with a monthly assessment so Mission Control can track how your spiritual, relational, emotional, physical, and stewardship life is moving together.</p>
              <button onClick={() => setActiveTab('assess')} className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Take first assessment</button>
            </section>
          ) : (
            <FlourishingAssessmentView assessment={overviewAssessment} history={history} />
          )}
        </div>
      )}

      {activeTab === 'assess' && (
        <div className="space-y-5">
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Assessment Mode</div>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">{assessmentType === 'monthly' ? 'Monthly Flourishing Assessment' : 'Ad Hoc Flourishing Check-In'}</h2>
              </div>
              <div className="inline-flex rounded-full bg-slate-100 p-1">
                <button onClick={() => setAssessmentType('monthly')} className={`rounded-full px-4 py-2 text-sm font-medium ${assessmentType === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Monthly</button>
                <button onClick={() => setAssessmentType('adhoc')} className={`rounded-full px-4 py-2 text-sm font-medium ${assessmentType === 'adhoc' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>Ad Hoc</button>
              </div>
            </div>
          </section>

          {groupedQuestions.map((group) => (
            <section key={group.domain} className={`rounded-[28px] border border-slate-200 bg-gradient-to-br ${DOMAIN_COLORS[group.domain].panel} p-6 shadow-sm`}>
              <div>
                <div className={`inline-flex rounded-full bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${DOMAIN_COLORS[group.domain].text}`}>{group.title}</div>
                <p className="mt-3 text-sm text-slate-600">{group.subtitle}</p>
              </div>
              <div className="mt-5 grid gap-4">
                {group.questions.map((question) => (
                  <label key={question.question_id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-200">
                    <div className="text-sm font-medium text-slate-800">{question.question_text}</div>
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-xs uppercase tracking-wide text-slate-500">{question.scale_labels.low}</span>
                      <input
                        className="w-full"
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={responses[question.question_id] ?? 5}
                        onChange={(event) => setResponses((prev) => ({ ...prev, [question.question_id]: Number(event.target.value) }))}
                      />
                      <span className="text-xs uppercase tracking-wide text-slate-500">{question.scale_labels.high}</span>
                      <div className="w-10 text-right text-lg font-semibold text-slate-900">{responses[question.question_id] ?? 5}</div>
                    </div>
                  </label>
                ))}
              </div>
            </section>
          ))}

          <div className="flex justify-end">
            <button onClick={submitAssessment} disabled={submitting} className="inline-flex min-h-[48px] items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-sm disabled:opacity-60">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Submit Assessment
            </button>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Assessment History</div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Track your season over time</h2>
            </div>
            <Link href="/reviews" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Back to Reviews</Link>
          </div>
          <div className="mt-6 grid gap-3">
            {history.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No flourishing history yet.</div>}
            {history.map((item) => (
              <button key={item.id} onClick={() => { setSelectedAssessment(item); setActiveTab('overview'); }} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition hover:border-slate-300 hover:bg-white">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.assessment_type === 'monthly' ? 'Monthly Assessment' : 'Ad Hoc Check-In'}</div>
                  <div className="mt-1 text-lg font-semibold text-slate-900">{formatDate(item.created_at)}</div>
                  <div className="mt-1 text-sm text-slate-600">{item.interpretation.overall_message}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Index</div>
                  <div className="mt-1 text-3xl font-semibold text-slate-900">{item.interpretation.display_index}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'persona' && (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Persona Review Queue</div>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Review flourishing-driven persona updates</h2>
            </div>
            <Link href="/knowledge" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700">Open Knowledge</Link>
          </div>
          <div className="mt-6 space-y-4">
            {proposalRows.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">No pending persona proposals.</div>}
            {proposalRows.map((proposal) => (
              <article key={proposal.id} className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{proposal.section_label}</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">{proposal.reason}</div>
                  </div>
                  <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-white">{proposal.confidence}</div>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Current</div>
                    <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{proposal.current_content || 'No current section content found.'}</pre>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Proposed</div>
                    <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{proposal.proposed_content}</pre>
                  </div>
                </div>
                <div className="mt-4 flex gap-3">
                  <button onClick={() => applyProposal('reject', [proposal.id])} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">Reject</button>
                  <button onClick={() => applyProposal('apply', [proposal.id])} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Approve & Apply</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Why this belongs in Mission Control</div>
          <p className="mt-2 text-sm text-slate-600">This is not generic self-help scoring. It is a monthly rhythm that keeps persona, review, health, and stewardship pointed in the same direction.</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Downstream usage</div>
          <p className="mt-2 text-sm text-slate-600">Latest flourishing context can shape dashboard summaries, future AI coaching, and review interpretation without silently rewriting your core documents.</p>
        </div>
        <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Review-first persona changes</div>
          <p className="mt-2 text-sm text-slate-600">Flourishing insights only become part of `persona.md` when you approve the proposed wording.</p>
        </div>
      </section>
    </div>
  );
}
