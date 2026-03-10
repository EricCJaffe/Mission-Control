import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildPersonaProposalInsert, buildPersonaSections, applyCurrentContentToPersonaProposals, generateFlourishingCoaching } from '@/lib/flourishing/coach';
import { ensureDefaultQuestionSet, getFlourishingHistory, upsertFlourishingProfile } from '@/lib/flourishing/profile';
import { scoreAssessment } from '@/lib/flourishing/scoring';
import type { AssessmentQuestion, CoreFlourishingDomain, FlourishingAssessmentType, FlourishingResponseMap } from '@/lib/flourishing/types';

export const dynamic = 'force-dynamic';

function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function validateResponses(questions: AssessmentQuestion[], responses: FlourishingResponseMap) {
  const missing = questions
    .filter((question) => question.required)
    .filter((question) => typeof responses[question.question_id] !== 'number' || responses[question.question_id] < 0 || responses[question.question_id] > 10)
    .map((question) => question.question_id);
  return missing;
}

function averageDomain(history: Awaited<ReturnType<typeof getFlourishingHistory>>, domain: CoreFlourishingDomain) {
  const values = history
    .flatMap((assessment) => assessment.domain_scores)
    .filter((score) => score.domain === domain)
    .map((score) => score.score)
    .filter((value): value is number => typeof value === 'number');
  return average(values);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const assessmentType = (body?.assessment_type === 'monthly' ? 'monthly' : 'adhoc') as FlourishingAssessmentType;
  const responses = (body?.responses ?? {}) as FlourishingResponseMap;
  const reviewId = typeof body?.review_id === 'string' ? body.review_id : null;

  const questionSet = await ensureDefaultQuestionSet();
  const missing = validateResponses(questionSet.questions, responses);
  if (missing.length > 0) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid required responses', missing }, { status: 400 });
  }

  const [history, personaResult, soulResult, healthResult, latestReview] = await Promise.all([
    getFlourishingHistory(user.id, 12),
    supabase.from('notes').select('content_md').eq('user_id', user.id).eq('title', 'persona').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('notes').select('content_md').eq('user_id', user.id).eq('title', 'soul').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('health_documents').select('content').eq('user_id', user.id).eq('is_current', true).maybeSingle(),
    supabase.from('monthly_reviews').select('period_start, alignment_score, alignment_status, drift_flags, survey').eq('user_id', user.id).order('period_start', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const previous = history[0] ?? null;
  const recent90d = history.filter((assessment) => {
    const created = new Date(assessment.created_at).getTime();
    return created >= Date.now() - (90 * 24 * 60 * 60 * 1000);
  });

  const { domainScores, interpretation } = scoreAssessment({
    responses,
    questions: questionSet.questions,
    previousDomainScores: previous
      ? Object.fromEntries(previous.domain_scores.map((score) => [score.domain, score.score])) as Partial<Record<CoreFlourishingDomain, number>>
      : undefined,
    previousIndex: previous?.interpretation.flourishing_index ?? null,
    previousOverallWellbeing: previous?.interpretation.overall_wellbeing_score ?? null,
    average90dIndex: average(recent90d.map((assessment) => assessment.interpretation.flourishing_index).filter((value): value is number => typeof value === 'number')),
    average90dDomainScores: {
      relational: averageDomain(recent90d, 'relational'),
      mental_emotional: averageDomain(recent90d, 'mental_emotional'),
      physical_brain: averageDomain(recent90d, 'physical_brain'),
      work_money_time: averageDomain(recent90d, 'work_money_time'),
      meaning_purpose_calling: averageDomain(recent90d, 'meaning_purpose_calling'),
      faith_spiritual: averageDomain(recent90d, 'faith_spiritual'),
    },
  });

  const personaContent = personaResult.data?.content_md ?? '';
  const soulContent = soulResult.data?.content_md ?? '';
  const healthContent = healthResult.data?.content ?? '';
  const personaSections = buildPersonaSections(personaContent);
  const reviewSummary = latestReview.data
    ? `Monthly review ${latestReview.data.period_start}: score ${latestReview.data.alignment_score ?? 'n/a'}, status ${latestReview.data.alignment_status ?? 'auto'}, drift flags ${(latestReview.data.drift_flags ?? []).join(', ') || 'none'}.`
    : null;

  const coaching = await generateFlourishingCoaching({
    domainScores,
    interpretation,
    persona: personaContent,
    soul: soulContent,
    health: healthContent,
    previousSummary: previous?.coaching?.executive_summary ?? null,
    monthlyReviewSummary: reviewSummary,
  });

  const personaProposals = applyCurrentContentToPersonaProposals(coaching.persona_update_proposals, personaSections);

  const { data: inserted, error } = await supabase
    .from('flourishing_assessments')
    .insert({
      user_id: user.id,
      assessment_type: assessmentType,
      review_id: reviewId,
      question_set_version: questionSet.version,
      responses,
      domain_scores: domainScores,
      interpretation,
      coaching: {
        ...coaching,
        persona_update_proposals: personaProposals,
      },
    })
    .select('*')
    .single();

  if (error || !inserted) {
    return NextResponse.json({ ok: false, error: error?.message || 'Failed to save assessment' }, { status: 500 });
  }

  if (personaProposals.length > 0) {
    await supabase.from('persona_pending_updates').insert(
      personaProposals.map((proposal) => buildPersonaProposalInsert(proposal, inserted.id, user.id))
    );
  }

  const assessment = {
    id: inserted.id,
    assessment_type: inserted.assessment_type,
    question_set_version: inserted.question_set_version,
    responses: inserted.responses,
    domain_scores: inserted.domain_scores,
    interpretation: inserted.interpretation,
    coaching: inserted.coaching,
    created_at: inserted.created_at,
  };

  await upsertFlourishingProfile(user.id, assessment);

  return NextResponse.json({ ok: true, assessment, pending_persona_proposals: personaProposals.length });
}
