import { supabaseServer } from '@/lib/supabase/server';
import { DEFAULT_FLOURISHING_QUESTIONS, DEFAULT_QUESTION_SET_VERSION } from './questions';
import type {
  AssessmentQuestion,
  CoreFlourishingDomain,
  FlourishingAssessmentResult,
  FlourishingCoachingPayload,
  FlourishingDomainCoaching,
  FlourishingDomainScore,
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

  return (data ?? []).map(normalizeAssessmentRow);
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
  return normalizeAssessmentRow(data);
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

function normalizeDomainCoaching(
  coaching: Partial<FlourishingDomainCoaching> | undefined,
  domainScores: FlourishingDomainScore[]
): FlourishingDomainCoaching {
  const domain = coaching?.domain ?? domainScores[0]?.domain ?? 'relational';
  const score = domainScores.find((item) => item.domain === domain);
  return {
    domain,
    insight_summary: coaching?.insight_summary ?? score?.summary ?? 'No additional domain insight available yet.',
    current_data_points: Array.isArray(coaching?.current_data_points) ? coaching!.current_data_points.slice(0, 4) : [],
    growth_focus: coaching?.growth_focus ?? 'Stay attentive to the next faithful growth edge here.',
    reflection_questions: Array.isArray(coaching?.reflection_questions) ? coaching!.reflection_questions.slice(0, 3) : [],
    journaling_prompts: Array.isArray(coaching?.journaling_prompts) ? coaching!.journaling_prompts.slice(0, 3) : [],
    encouraging_statement: coaching?.encouraging_statement ?? 'Receive grace and take the next faithful step.',
  };
}

function normalizeCoachingPayload(
  coaching: Partial<FlourishingCoachingPayload> | null | undefined,
  domainScores: FlourishingDomainScore[]
): FlourishingCoachingPayload {
  const provided = Array.isArray(coaching?.domain_coaching) ? coaching!.domain_coaching : [];
  const byDomain = new Map(provided.map((item) => [item.domain, normalizeDomainCoaching(item, domainScores)]));
  const domainCoaching = domainScores.map((score) => byDomain.get(score.domain) ?? normalizeDomainCoaching({ domain: score.domain }, domainScores));

  return {
    executive_summary: coaching?.executive_summary ?? 'No executive summary available yet.',
    narrative_summary: coaching?.narrative_summary ?? coaching?.executive_summary ?? 'No narrative summary available yet.',
    domain_coaching: domainCoaching,
    persona_update_proposals: Array.isArray(coaching?.persona_update_proposals) ? coaching!.persona_update_proposals : [],
  };
}

function normalizeAssessmentRow(row: {
  id: string;
  assessment_type: FlourishingAssessmentResult['assessment_type'];
  question_set_version: number;
  responses: unknown;
  domain_scores: FlourishingDomainScore[];
  interpretation: FlourishingAssessmentResult['interpretation'];
  coaching: Partial<FlourishingCoachingPayload> | null;
  created_at: string;
}): FlourishingAssessmentResult {
  const domainScores = Array.isArray(row.domain_scores) ? row.domain_scores : [];
  return {
    id: row.id,
    assessment_type: row.assessment_type,
    question_set_version: row.question_set_version,
    responses: (row.responses as FlourishingResponseMap) ?? {},
    domain_scores: domainScores,
    interpretation: row.interpretation,
    coaching: normalizeCoachingPayload(row.coaching, domainScores),
    created_at: row.created_at,
  };
}
