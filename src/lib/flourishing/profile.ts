import { supabaseServer } from '@/lib/supabase/server';
import { DEFAULT_FLOURISHING_QUESTIONS, DEFAULT_QUESTION_SET_VERSION } from './questions';
import type {
  AssessmentQuestion,
  CoreFlourishingDomain,
  FlourishingAssessmentResult,
  FlourishingProfile,
  FlourishingResponseMap,
  PersonaUpdateProposal,
} from './types';

export async function ensureDefaultQuestionSet() {
  const supabase = await supabaseServer();
  const { data: existing } = await supabase
    .from('flourishing_question_sets')
    .select('id, version, questions')
    .eq('version', DEFAULT_QUESTION_SET_VERSION)
    .maybeSingle();

  if (existing) {
    return {
      version: existing.version,
      questions: (existing.questions as AssessmentQuestion[]) ?? DEFAULT_FLOURISHING_QUESTIONS,
    };
  }

  const { data } = await supabase
    .from('flourishing_question_sets')
    .insert({
      version: DEFAULT_QUESTION_SET_VERSION,
      name: 'Flourishing Core v1',
      questions: DEFAULT_FLOURISHING_QUESTIONS,
      active: true,
    })
    .select('version, questions')
    .single();

  return {
    version: data?.version ?? DEFAULT_QUESTION_SET_VERSION,
    questions: (data?.questions as AssessmentQuestion[]) ?? DEFAULT_FLOURISHING_QUESTIONS,
  };
}

export async function getLatestFlourishingProfile(userId: string): Promise<FlourishingProfile | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('flourishing_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;
  return {
    user_id: data.user_id,
    latest_assessment_id: data.latest_assessment_id,
    flourishing_index: data.flourishing_index,
    display_index: data.display_index,
    domain_scores: (data.domain_scores as FlourishingProfile['domain_scores']) ?? [],
    strongest_domains: (data.strongest_domains as CoreFlourishingDomain[]) ?? [],
    growth_domains: (data.growth_domains as CoreFlourishingDomain[]) ?? [],
    overall_message: data.overall_message,
    trend_summary: (data.trend_summary as FlourishingProfile['trend_summary']) ?? null,
    updated_at: data.updated_at,
  };
}

export async function getFlourishingHistory(userId: string, limit = 12): Promise<FlourishingAssessmentResult[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('flourishing_assessments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    assessment_type: row.assessment_type,
    question_set_version: row.question_set_version,
    responses: (row.responses as FlourishingResponseMap) ?? {},
    domain_scores: row.domain_scores,
    interpretation: row.interpretation,
    coaching: row.coaching,
    created_at: row.created_at,
  }));
}

export async function getFlourishingAssessment(userId: string, assessmentId: string): Promise<FlourishingAssessmentResult | null> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('flourishing_assessments')
    .select('*')
    .eq('id', assessmentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id,
    assessment_type: data.assessment_type,
    question_set_version: data.question_set_version,
    responses: (data.responses as FlourishingResponseMap) ?? {},
    domain_scores: data.domain_scores,
    interpretation: data.interpretation,
    coaching: data.coaching,
    created_at: data.created_at,
  };
}

export async function getPendingPersonaProposals(userId: string) {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from('persona_pending_updates')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  return data ?? [];
}

export async function upsertFlourishingProfile(userId: string, assessment: FlourishingAssessmentResult) {
  const supabase = await supabaseServer();
  const interpretation = assessment.interpretation;

  await supabase.from('flourishing_profiles').upsert({
    user_id: userId,
    latest_assessment_id: assessment.id,
    flourishing_index: interpretation.flourishing_index,
    display_index: interpretation.display_index,
    domain_scores: assessment.domain_scores,
    strongest_domains: interpretation.strongest_domains,
    growth_domains: interpretation.growth_domains,
    overall_message: interpretation.overall_message,
    trend_summary: {
      previous_index: interpretation.previous_index,
      delta_from_previous: interpretation.delta_from_previous,
      average_90d: interpretation.average_90d,
      delta_from_90d_average: interpretation.delta_from_90d_average,
    },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

export async function savePersonaProposals(userId: string, assessmentId: string, proposals: PersonaUpdateProposal[]) {
  if (proposals.length === 0) return;
  const supabase = await supabaseServer();
  await supabase
    .from('persona_pending_updates')
    .insert(proposals.map((proposal) => ({
      user_id: userId,
      assessment_id: assessmentId,
      section_key: proposal.section_key,
      section_label: proposal.section_label,
      current_content: proposal.current_content,
      proposed_content: proposal.proposed_content,
      diff_html: null,
      reason: proposal.reason,
      confidence: proposal.confidence,
    })));
}
