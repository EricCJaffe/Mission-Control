export type FlourishingDomain =
  | 'relational'
  | 'mental_emotional'
  | 'physical_brain'
  | 'work_money_time'
  | 'meaning_purpose_calling'
  | 'faith_spiritual'
  | 'overall_wellbeing';

export type CoreFlourishingDomain = Exclude<FlourishingDomain, 'overall_wellbeing'>;
export type FlourishingAssessmentType = 'monthly' | 'adhoc';
export type FlourishingScaleQuestionType = 'scale_0_10';
export type Confidence = 'high' | 'medium' | 'low';
export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export type AssessmentQuestion = {
  question_id: string;
  section: number;
  domain: FlourishingDomain;
  question_text: string;
  question_type: FlourishingScaleQuestionType;
  scale_labels: {
    low: string;
    high: string;
  };
  required: boolean;
  order: number;
};

export type FlourishingResponseMap = Record<string, number>;

export type FlourishingDomainScore = {
  domain: CoreFlourishingDomain;
  label: string;
  score: number;
  display_score: number;
  previous_score: number | null;
  delta_from_previous: number | null;
  average_90d: number | null;
  delta_from_90d_average: number | null;
  status: 'thriving' | 'steady' | 'needs_attention';
  summary: string;
  scripture?: {
    reference: string;
    text: string;
  } | null;
  tips?: string[];
};

export type FlourishingInterpretation = {
  flourishing_index: number;
  display_index: number;
  overall_message: string;
  strongest_domains: CoreFlourishingDomain[];
  growth_domains: CoreFlourishingDomain[];
  discrepancy_flags: string[];
  overall_wellbeing_score: number | null;
  previous_index: number | null;
  delta_from_previous: number | null;
  average_90d: number | null;
  delta_from_90d_average: number | null;
};

export type FlourishingDomainCoaching = {
  domain: CoreFlourishingDomain;
  reflection_questions: string[];
  journaling_prompts: string[];
  encouraging_statement: string;
};

export type PersonaUpdateProposal = {
  section_key: string;
  section_label: string;
  current_content: string;
  proposed_content: string;
  reason: string;
  confidence: Confidence;
};

export type FlourishingCoachingPayload = {
  executive_summary: string;
  narrative_summary: string;
  domain_coaching: FlourishingDomainCoaching[];
  persona_update_proposals: PersonaUpdateProposal[];
};

export type FlourishingAssessmentResult = {
  id: string;
  assessment_type: FlourishingAssessmentType;
  question_set_version: number;
  responses: FlourishingResponseMap;
  domain_scores: FlourishingDomainScore[];
  interpretation: FlourishingInterpretation;
  coaching: FlourishingCoachingPayload;
  created_at: string;
};

export type FlourishingProfile = {
  user_id: string;
  latest_assessment_id: string | null;
  flourishing_index: number | null;
  display_index: number | null;
  domain_scores: FlourishingDomainScore[];
  strongest_domains: CoreFlourishingDomain[];
  growth_domains: CoreFlourishingDomain[];
  overall_message: string | null;
  trend_summary: {
    previous_index: number | null;
    delta_from_previous: number | null;
    average_90d: number | null;
    delta_from_90d_average: number | null;
  } | null;
  updated_at: string;
};

export const FLOURISHING_DOMAIN_LABELS: Record<CoreFlourishingDomain, string> = {
  relational: 'Relational Health',
  mental_emotional: 'Mental & Emotional Health',
  physical_brain: 'Physical & Brain Health',
  work_money_time: 'Work, Money & Time Stewardship',
  meaning_purpose_calling: 'Meaning, Purpose & Calling',
  faith_spiritual: 'Faith & Spiritual Life',
};

export const DOMAIN_COLORS: Record<FlourishingDomain, { accent: string; panel: string; text: string; ring: string }> = {
  relational: { accent: '#f97360', panel: 'from-rose-50 via-white to-orange-50', text: 'text-rose-700', ring: '#fb7185' },
  mental_emotional: { accent: '#2563eb', panel: 'from-blue-50 via-white to-sky-50', text: 'text-blue-700', ring: '#60a5fa' },
  physical_brain: { accent: '#059669', panel: 'from-emerald-50 via-white to-teal-50', text: 'text-emerald-700', ring: '#34d399' },
  work_money_time: { accent: '#d97706', panel: 'from-amber-50 via-white to-yellow-50', text: 'text-amber-700', ring: '#fbbf24' },
  meaning_purpose_calling: { accent: '#4f46e5', panel: 'from-indigo-50 via-white to-violet-50', text: 'text-indigo-700', ring: '#818cf8' },
  faith_spiritual: { accent: '#ca8a04', panel: 'from-yellow-50 via-white to-amber-50', text: 'text-yellow-700', ring: '#facc15' },
  overall_wellbeing: { accent: '#475569', panel: 'from-slate-50 via-white to-slate-100', text: 'text-slate-700', ring: '#94a3b8' },
};
