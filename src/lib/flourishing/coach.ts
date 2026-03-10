import { diffLines } from 'diff';
import { callOpenAI } from '@/lib/openai';
import type {
  Confidence,
  CoreFlourishingDomain,
  FlourishingCoachingPayload,
  FlourishingDomainCoaching,
  FlourishingDomainScore,
  FlourishingInterpretation,
  PersonaUpdateProposal,
} from './types';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

function extractJson(raw: string) {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced) return JSON.parse(fenced[1]);
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }
  return JSON.parse(trimmed);
}

function fallbackCoaching(domainScores: FlourishingDomainScore[], overallMessage: string): FlourishingCoachingPayload {
  const domain_coaching: FlourishingDomainCoaching[] = domainScores.map((item) => ({
    domain: item.domain,
    insight_summary: `Current assessment read: ${item.summary}`,
    current_data_points: [
      `Score: ${item.display_score}/10`,
      item.delta_from_previous != null ? `Change since previous: ${item.delta_from_previous > 0 ? '+' : ''}${item.delta_from_previous}` : 'No previous assessment comparison yet',
      item.average_90d != null ? `90-day average: ${item.average_90d}` : '90-day baseline not established yet',
    ],
    growth_focus: item.score >= 8
      ? `Protect this strength and turn it into steady stewardship rather than drift or complacency.`
      : `There is still room to grow here through one concrete, repeatable next step.`,
    reflection_questions: [
      `What is strengthening ${item.label.toLowerCase()} right now?`,
      `What is draining ${item.label.toLowerCase()} right now?`,
      `What act of faithfulness would move this domain forward this week?`,
    ],
    journaling_prompts: [
      `Describe the current reality of ${item.label.toLowerCase()} without spin or self-protection.`,
      `Where have you seen grace in this domain recently?`,
      `What one concrete change would you commit to over the next 30 days in ${item.label.toLowerCase()}?`,
    ],
    encouraging_statement: item.score >= 8
      ? `Stay steady in ${item.label.toLowerCase()} and use this strength to serve others well.`
      : `God's grace is sufficient as you strengthen ${item.label.toLowerCase()} one faithful step at a time.`,
  }));

  return {
    executive_summary: overallMessage,
    narrative_summary: `${overallMessage} The clearest strengths and growth edges have been preserved so you can respond with prayerful action instead of vague self-criticism.`,
    domain_coaching,
    persona_update_proposals: [],
  };
}

function diffHtml(current: string, proposed: string) {
  return diffLines(current, proposed)
    .map((part) => {
      const color = part.added ? 'bg-emerald-50 text-emerald-900' : part.removed ? 'bg-rose-50 text-rose-900 line-through' : 'text-slate-700';
      return `<div class="${color}">${part.value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] as string))}</div>`;
    })
    .join('');
}

export async function generateFlourishingCoaching(params: {
  domainScores: FlourishingDomainScore[];
  interpretation: FlourishingInterpretation;
  persona: string;
  soul: string;
  health: string;
  previousSummary?: string | null;
  monthlyReviewSummary?: string | null;
}): Promise<FlourishingCoachingPayload> {
  const { domainScores, interpretation, persona, soul, health, previousSummary, monthlyReviewSummary } = params;

  const domainSummary = domainScores.map((item) => ({
    domain: item.domain,
    label: item.label,
    score: item.display_score,
    status: item.status,
    summary: item.summary,
    delta_from_previous: item.delta_from_previous,
    delta_from_90d_average: item.delta_from_90d_average,
  }));

  const system = [
    'You are a compassionate, wise, explicitly Christian flourishing coach.',
    'Your tone is supportive, direct, grounded in grace, and focused on growth.',
    'Use Scripture naturally and faithfully, not as decoration.',
    'Return STRICT JSON only.',
  ].join(' ');

  const user = `Build a flourishing coaching payload using this context.

Use the sources distinctly:
- persona.md = enduring identity, mission, values, calling, priorities, constraints
- soul.md = current inner life, emotional weather, relational strain, what restores or drains
- health.md = body-level reality, medical constraints, baselines, medications, training and recovery context

Current domain scores:
${JSON.stringify(domainSummary, null, 2)}

Interpretation:
${JSON.stringify(interpretation, null, 2)}

Persona:\n${persona || 'N/A'}

Soul:\n${soul || 'N/A'}

Health:\n${health || 'N/A'}

Previous flourishing summary:\n${previousSummary || 'None'}

Latest review/alignment summary:\n${monthlyReviewSummary || 'None'}

Return JSON with this shape:
{
  "executive_summary": "2-4 sentence overview",
  "narrative_summary": "4-8 sentence synthesis",
  "domain_coaching": [
    {
      "domain": "relational",
      "insight_summary": "2-4 sentence domain-specific interpretation grounded in the supplied context",
      "current_data_points": ["short bullet", "short bullet", "short bullet"],
      "growth_focus": "1-2 sentence explanation of the next growth edge even if the score is strong",
      "reflection_questions": ["...", "...", "..."],
      "journaling_prompts": ["...", "...", "..."],
      "encouraging_statement": "..."
    }
  ],
  "persona_update_proposals": [
    {
      "section_key": "current_season|mission_alignment|constraints|growth_edge|stewardship",
      "section_label": "...",
      "reason": "...",
      "confidence": "high|medium|low",
      "proposed_content": "Markdown for that section only"
    }
  ]
}

Rules:
- Generate coaching for all six core domains.
- Emphasize domains below 6.0.
- Even strong domains must still receive specific insight, maintenance guidance, and a growth edge.
- Use health.md heavily for physical_brain, soul.md heavily for mental_emotional and relational, and persona.md heavily for work_money_time, meaning_purpose_calling, and faith_spiritual.
- If a domain is 8.0+, focus on stewardship, maintenance, and helping others.
- Persona proposals should only cover sections that clearly need adjustment based on the assessment.
- Do not output commentary outside JSON.`;

  try {
    const raw = await callOpenAI({ model: MODEL, system, user });
    const parsed = extractJson(raw) as {
      executive_summary?: string;
      narrative_summary?: string;
      domain_coaching?: Array<{
        domain: CoreFlourishingDomain;
        insight_summary?: string;
        current_data_points?: string[];
        growth_focus?: string;
        reflection_questions?: string[];
        journaling_prompts?: string[];
        encouraging_statement?: string;
      }>;
      persona_update_proposals?: Array<{
        section_key: string;
        section_label?: string;
        reason?: string;
        confidence?: Confidence;
        proposed_content?: string;
      }>;
    };

    const coaching = parsed.domain_coaching
      ?.filter((item) => item && item.domain)
      .map((item) => ({
        domain: item.domain,
        insight_summary: item.insight_summary ?? 'No additional AI summary was returned for this domain.',
        current_data_points: (item.current_data_points ?? []).slice(0, 4),
        growth_focus: item.growth_focus ?? 'Stay attentive to the next faithful growth edge here.',
        reflection_questions: (item.reflection_questions ?? []).slice(0, 3),
        journaling_prompts: (item.journaling_prompts ?? []).slice(0, 3),
        encouraging_statement: item.encouraging_statement ?? 'Receive grace and take the next faithful step.',
      })) ?? [];

    return {
      executive_summary: parsed.executive_summary ?? interpretation.overall_message,
      narrative_summary: parsed.narrative_summary ?? interpretation.overall_message,
      domain_coaching: coaching.length > 0 ? coaching : fallbackCoaching(domainScores, interpretation.overall_message).domain_coaching,
      persona_update_proposals: (parsed.persona_update_proposals ?? [])
        .filter((item) => item.section_key && item.proposed_content)
        .map((item) => ({
          section_key: item.section_key,
          section_label: item.section_label ?? item.section_key,
          current_content: '',
          proposed_content: item.proposed_content ?? '',
          reason: item.reason ?? 'Flourishing assessment suggests this persona refinement.',
          confidence: item.confidence ?? 'medium',
        })),
    };
  } catch {
    return fallbackCoaching(domainScores, interpretation.overall_message);
  }
}

export function applyCurrentContentToPersonaProposals(
  proposals: PersonaUpdateProposal[],
  personaSections: Record<string, string>
): PersonaUpdateProposal[] {
  return proposals.map((proposal) => {
    const current = personaSections[proposal.section_key] ?? '';
    const heading = current.split('\n')[0] ?? '';
    const proposedContent = current && heading.startsWith('## ') && !proposal.proposed_content.trim().startsWith('## ')
      ? `${heading}\n${proposal.proposed_content.trim()}`
      : proposal.proposed_content;
    return {
      ...proposal,
      current_content: current,
      proposed_content: proposedContent,
    };
  });
}

export function buildPersonaProposalInsert(proposal: PersonaUpdateProposal, assessmentId: string, userId: string) {
  return {
    user_id: userId,
    assessment_id: assessmentId,
    section_key: proposal.section_key,
    section_label: proposal.section_label,
    current_content: proposal.current_content,
    proposed_content: proposal.proposed_content,
    diff_html: diffHtml(proposal.current_content, proposal.proposed_content),
    reason: proposal.reason,
    confidence: proposal.confidence,
  };
}

export function buildPersonaSections(personaContent: string) {
  const sections = [
    { key: 'current_season', marker: '## 5) What Eric is building now (season of action)' },
    { key: 'mission_alignment', marker: '## 1) Mission (non-negotiable)' },
    { key: 'constraints', marker: '## 7) Red lines (Eric will push back)' },
    { key: 'growth_edge', marker: '## 9) Collaboration instructions for Codex/agents' },
    { key: 'stewardship', marker: '## 3) Core values (how Eric evaluates choices)' },
  ] as const;

  const lines = personaContent.split('\n');
  const result: Record<string, string> = {};

  for (const section of sections) {
    const start = lines.findIndex((line) => line.trim() === section.marker);
    if (start === -1) {
      result[section.key] = '';
      continue;
    }
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i += 1) {
      if (lines[i].startsWith('## ')) {
        end = i;
        break;
      }
    }
    result[section.key] = lines.slice(start, end).join('\n').trim();
  }

  return result;
}

export function applyPersonaProposalToContent(personaContent: string, proposal: PersonaUpdateProposal) {
  const sections = buildPersonaSections(personaContent);
  const current = sections[proposal.section_key] ?? '';
  if (!current) return `${personaContent.trim()}\n\n${proposal.proposed_content.trim()}\n`;
  return personaContent.replace(current, proposal.proposed_content.trim());
}
