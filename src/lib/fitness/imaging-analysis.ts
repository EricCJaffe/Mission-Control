import { callOpenAI } from '@/lib/openai';
import { buildAISystemPrompt } from './health-context';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

export type ImagingAnalysis = {
  report_type: 'imaging';
  modality: string;
  study_title: string;
  exam_date: string | null;
  facility: string | null;
  ordering_clinician: string | null;
  summary: string;
  key_findings: Array<{
    finding: string;
    severity: 'high' | 'moderate' | 'low';
    evidence: string;
    significance: string;
  }>;
  quantified_metrics: {
    lvef_percent?: number | null;
    lv_end_diastolic_volume_ml?: number | null;
    lv_end_systolic_volume_ml?: number | null;
    stroke_volume_ml?: number | null;
    cardiac_output_l_min?: number | null;
  };
  impression: string;
  cardiac_implications: string[];
  training_implications: string[];
  medication_discussion_points: string[];
  appointment_questions: string[];
  health_doc_summary: string;
};

export async function analyzeImagingReport(params: {
  userId: string;
  reportText: string;
  studyTitle: string;
  modality?: string;
  examDate?: string | null;
  facility?: string | null;
  orderingClinician?: string | null;
}): Promise<ImagingAnalysis> {
  const systemPrompt = await buildAISystemPrompt(params.userId, 'general_health_query');

  const userPrompt = `You are analyzing a diagnostic imaging report for structured storage and cardiology follow-up.

Study title: ${params.studyTitle}
Modality: ${params.modality || 'Imaging'}
Exam date: ${params.examDate || 'Unknown'}
Facility: ${params.facility || 'Unknown'}
Ordering clinician: ${params.orderingClinician || 'Unknown'}

Return ONLY valid JSON:
{
  "report_type": "imaging",
  "modality": "Specific modality",
  "study_title": "Study title",
  "exam_date": "YYYY-MM-DD or null",
  "facility": "Facility name or null",
  "ordering_clinician": "Clinician name or null",
  "summary": "4-6 sentence plain-English summary focused on the most clinically important findings.",
  "key_findings": [
    {
      "finding": "Short label",
      "severity": "high|moderate|low",
      "evidence": "Exact imaging evidence in plain English",
      "significance": "Why it matters clinically"
    }
  ],
  "quantified_metrics": {
    "lvef_percent": 0,
    "lv_end_diastolic_volume_ml": 0,
    "lv_end_systolic_volume_ml": 0,
    "stroke_volume_ml": 0,
    "cardiac_output_l_min": 0
  },
  "impression": "One concise paragraph summarizing the formal impression.",
  "cardiac_implications": ["Bullet-style strings about prognosis, risk, and clinical interpretation"],
  "training_implications": ["Bullet-style strings about exercise tolerance, caution, and safety"],
  "medication_discussion_points": ["Bullet-style strings about medication or management topics to discuss with cardiologist"],
  "appointment_questions": ["4-6 high-value cardiology follow-up questions"],
  "health_doc_summary": "2-4 sentence summary suitable for inserting into health.md Medical History / Vital Baselines."
}

Focus heavily on:
- LVEF
- regional wall motion abnormalities
- scar / late gadolinium enhancement / infarct evidence
- whether there is viable myocardium vs remote infarct / scar burden
- valvular findings
- explicit reassurance when no acute valvular or structural pathology is seen

Report text:
${params.reportText}`;

  const result = await callOpenAI({
    model: DEFAULT_MODEL,
    system: systemPrompt,
    user: userPrompt,
  });

  return JSON.parse(result) as ImagingAnalysis;
}
