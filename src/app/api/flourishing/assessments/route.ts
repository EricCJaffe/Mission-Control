import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildPersonaProposalInsert, buildPersonaSections, applyCurrentContentToPersonaProposals, generateFlourishingCoaching } from '@/lib/flourishing/coach';
import { ensureDefaultQuestionSet, getFlourishingAssessment, getFlourishingHistory, upsertFlourishingProfile } from '@/lib/flourishing/profile';
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

async function loadFlourishingContext(supabase: Awaited<ReturnType<typeof supabaseServer>>, userId: string) {
  const [personaResult, soulResult, healthResult, latestReview] = await Promise.all([
    supabase.from('notes').select('content_md').eq('user_id', userId).eq('title', 'persona').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('notes').select('content_md').eq('user_id', userId).eq('title', 'soul').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('health_documents').select('content').eq('user_id', userId).eq('is_current', true).maybeSingle(),
    supabase.from('monthly_reviews').select('period_start, alignment_score, alignment_status, drift_flags, survey').eq('user_id', userId).order('period_start', { ascending: false }).limit(1).maybeSingle(),
  ]);

  return {
    personaContent: personaResult.data?.content_md ?? '',
    soulContent: soulResult.data?.content_md ?? '',
    healthContent: healthResult.data?.content ?? '',
    reviewSummary: latestReview.data
      ? `Monthly review ${latestReview.data.period_start}: score ${latestReview.data.alignment_score ?? 'n/a'}, status ${latestReview.data.alignment_status ?? 'auto'}, drift flags ${(latestReview.data.drift_flags ?? []).join(', ') || 'none'}.`
      : null,
  };
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const mode = typeof body?.mode === 'string' ? body.mode : '';

  if (mode === 'refresh_insights') {
    const assessmentId = typeof body?.assessment_id === 'string' ? body.assessment_id : '';
    if (!assessmentId) {
      return NextResponse.json({ ok: false, error: 'assessment_id required' }, { status: 400 });
    }

    const assessment = await getFlourishingAssessment(user.id, assessmentId);
    if (!assessment) {
      return NextResponse.json({ ok: false, error: 'Assessment not found' }, { status: 404 });
    }

    const history = await getFlourishingHistory(user.id, 12);
    const previousSummary = history.find((item) => item.id !== assessmentId)?.coaching?.executive_summary ?? null;
    const { personaContent, soulContent, healthContent, reviewSummary } = await loadFlourishingContext(supabase, user.id);
    const personaSections = buildPersonaSections(personaContent);

    const refreshedCoaching = await generateFlourishingCoaching({
      domainScores: assessment.domain_scores,
      interpretation: assessment.interpretation,
      persona: personaContent,
      soul: soulContent,
      health: healthContent,
      previousSummary,
      monthlyReviewSummary: reviewSummary,
    });

    const personaProposals = applyCurrentContentToPersonaProposals(refreshedCoaching.persona_update_proposals, personaSections);
    const coachingPayload = { ...refreshedCoaching, persona_update_proposals: personaProposals };

    const { data: updated, error: updateError } = await supabase
      .from('flourishing_assessments')
      .update({ coaching: coachingPayload })
      .eq('id', assessmentId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ ok: false, error: updateError?.message || 'Failed to refresh insights' }, { status: 500 });
    }

    await supabase.from('persona_pending_updates').delete().eq('assessment_id', assessmentId).eq('user_id', user.id).eq('status', 'pending');
    if (personaProposals.length > 0) {
      await supabase.from('persona_pending_updates').insert(
        personaProposals.map((proposal) => buildPersonaProposalInsert(proposal, assessmentId, user.id))
      );
    }

    return NextResponse.json({
      ok: true,
      assessment: {
        id: updated.id,
        assessment_type: updated.assessment_type,
        question_set_version: updated.question_set_version,
        responses: updated.responses,
        domain_scores: updated.domain_scores,
        interpretation: updated.interpretation,
        coaching: updated.coaching,
        created_at: updated.created_at,
      },
    });
  }

  const assessmentType = (body?.assessment_type === 'monthly' ? 'monthly' : 'adhoc') as FlourishingAssessmentType;
  const responses = (body?.responses ?? {}) as FlourishingResponseMap;
  const reviewId = typeof body?.review_id === 'string' ? body.review_id : null;

  const questionSet = await ensureDefaultQuestionSet();
  const missing = validateResponses(questionSet.questions, responses);
  if (missing.length > 0) {
    return NextResponse.json({ ok: false, error: 'Missing or invalid required responses', missing }, { status: 400 });
  }

  const [history, context] = await Promise.all([
    getFlourishingHistory(user.id, 12),
    loadFlourishingContext(supabase, user.id),
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

  const { personaContent, soulContent, healthContent, reviewSummary } = context;
  const personaSections = buildPersonaSections(personaContent);

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
