import { DEFAULT_FLOURISHING_QUESTIONS } from './questions';
import type {
  AssessmentQuestion,
  CoreFlourishingDomain,
  FlourishingDomainScore,
  FlourishingInterpretation,
  FlourishingResponseMap,
} from './types';
import { FLOURISHING_DOMAIN_LABELS } from './types';

const DOMAIN_SUPPORT: Record<
  CoreFlourishingDomain,
  {
    thriving: { reference: string; text: string; tips: string[] };
    steady: { reference: string; text: string; tips: string[] };
    needs_attention: { reference: string; text: string; tips: string[] };
  }
> = {
  relational: {
    thriving: {
      reference: 'Romans 12:10',
      text: 'Love one another with brotherly affection. Outdo one another in showing honor.',
      tips: [
        'Use one strong relationship to actively encourage someone else this week.',
        'Protect one unhurried block of presence with family or a close friend.',
        'Ask where your relational strength can become service, not assumption.',
      ],
    },
    steady: {
      reference: '1 Thessalonians 5:11',
      text: 'Encourage one another and build one another up, just as you are doing.',
      tips: [
        'Initiate one intentional conversation this week with someone who matters most.',
        'Strengthen one relationship through direct encouragement instead of passive goodwill.',
        'Schedule one act of presence that is not tied to work or efficiency.',
      ],
    },
    needs_attention: {
      reference: 'Galatians 6:2',
      text: 'Bear one another’s burdens, and so fulfill the law of Christ.',
      tips: [
        'Initiate one intentional conversation this week with someone who matters most.',
        'Name one relationship strain honestly in prayer before trying to fix it quickly.',
        'Schedule one act of presence that is not tied to work or efficiency.',
      ],
    },
  },
  mental_emotional: {
    thriving: {
      reference: 'Isaiah 26:3',
      text: 'You keep him in perfect peace whose mind is stayed on you, because he trusts in you.',
      tips: [
        'Protect the rhythms that are currently keeping your mind steady.',
        'Turn your current peace into margin for wiser decisions under pressure.',
        'Offer encouragement to someone else carrying emotional strain this week.',
      ],
    },
    steady: {
      reference: 'Colossians 3:15',
      text: 'Let the peace of Christ rule in your hearts.',
      tips: [
        'Start a short daily reset rhythm: Scripture, prayer, and a 5-minute breathing walk.',
        'Name the main pressure you are carrying instead of letting it stay vague.',
        'Reduce one unnecessary source of mental noise this week.',
      ],
    },
    needs_attention: {
      reference: 'Philippians 4:6-7',
      text: 'Do not be anxious about anything... and the peace of God... will guard your hearts and your minds.',
      tips: [
        'Start a short daily reset rhythm: Scripture, prayer, and a 5-minute breathing walk.',
        'Name the main pressure you are carrying instead of letting it stay vague.',
        'Reduce one unnecessary source of mental noise this week.',
      ],
    },
  },
  physical_brain: {
    thriving: {
      reference: '3 John 1:2',
      text: 'Beloved, I pray that all may go well with you and that you may be in good health, as it goes well with your soul.',
      tips: [
        'Protect the current health rhythms that are giving you steadiness and capacity.',
        'Choose one body-composition, recovery, or cardiovascular metric to improve deliberately over the next month.',
        'Use health stability to increase consistency, not intensity drift.',
      ],
    },
    steady: {
      reference: 'Proverbs 4:20-22',
      text: 'They are life to those who find them, and healing to all their flesh.',
      tips: [
        'Choose one non-negotiable recovery anchor for this week: sleep, walking, hydration, or mobility.',
        'Make the next health decision simple enough to repeat, not impressive enough to abandon.',
        'Review whether your current physical rhythms support long-term stewardship.',
      ],
    },
    needs_attention: {
      reference: '1 Corinthians 6:19-20',
      text: 'Your body is a temple of the Holy Spirit within you... glorify God in your body.',
      tips: [
        'Choose one non-negotiable recovery anchor for this week: sleep, walking, hydration, or mobility.',
        'Make the next health decision simple enough to repeat, not impressive enough to abandon.',
        'Review whether your current physical rhythms support long-term stewardship.',
      ],
    },
  },
  work_money_time: {
    thriving: {
      reference: '1 Corinthians 4:2',
      text: 'It is required of stewards that they be found faithful.',
      tips: [
        'Audit whether your current stewardship strength is still aligned with first-order priorities.',
        'Use one block of strong focus for the work that creates the highest long-term fruit.',
        'Translate current momentum into cleaner margin, not more load.',
      ],
    },
    steady: {
      reference: 'Psalm 90:12',
      text: 'Teach us to number our days that we may get a heart of wisdom.',
      tips: [
        'Block one high-value hour this week before reactive tasks take over.',
        'Identify one financial or scheduling leak that is draining peace or margin.',
        'Let your calendar reflect your convictions before your urgencies.',
      ],
    },
    needs_attention: {
      reference: 'Ephesians 5:15-16',
      text: 'Look carefully then how you walk... making the best use of the time.',
      tips: [
        'Block one high-value hour this week before reactive tasks take over.',
        'Identify one financial or scheduling leak that is draining peace or margin.',
        'Let your calendar reflect your convictions before your urgencies.',
      ],
    },
  },
  meaning_purpose_calling: {
    thriving: {
      reference: 'Ephesians 2:10',
      text: 'We are his workmanship, created in Christ Jesus for good works, which God prepared beforehand.',
      tips: [
        'Clarify how your current calling strength can multiply into service for others.',
        'Name one way to protect humility as purpose and opportunity increase.',
        'Refine one mission priority so calling stays sharp, not assumed.',
      ],
    },
    steady: {
      reference: '2 Timothy 1:9',
      text: 'He saved us and called us to a holy calling... because of his own purpose and grace.',
      tips: [
        'Write a short sentence describing what faithfulness looks like in this season.',
        'Identify one activity that feels busy but disconnected from calling.',
        'Name one contribution you believe God is asking you to strengthen right now.',
      ],
    },
    needs_attention: {
      reference: 'Colossians 3:23-24',
      text: 'Whatever you do, work heartily, as for the Lord and not for men.',
      tips: [
        'Write a short sentence describing what faithfulness looks like in this season.',
        'Identify one activity that feels busy but disconnected from calling.',
        'Name one contribution you believe God is asking you to strengthen right now.',
      ],
    },
  },
  faith_spiritual: {
    thriving: {
      reference: 'Psalm 1:2-3',
      text: 'His delight is in the law of the Lord... He is like a tree planted by streams of water.',
      tips: [
        'Protect the hidden rhythms that are making your faith life durable.',
        'Let your strength in this area overflow into encouragement or discipleship for someone else.',
        'Choose one practice that deepens delight in God, not just output for God.',
      ],
    },
    steady: {
      reference: 'James 4:8',
      text: 'Draw near to God, and he will draw near to you.',
      tips: [
        'Return to a simple daily abiding rhythm instead of waiting for the perfect spiritual plan.',
        'Confess quickly where drift is showing up rather than spiritualizing it away.',
        'Pair Scripture with one concrete act of obedience this week.',
      ],
    },
    needs_attention: {
      reference: 'John 15:5',
      text: 'Whoever abides in me and I in him, he it is that bears much fruit.',
      tips: [
        'Return to a simple daily abiding rhythm instead of waiting for the perfect spiritual plan.',
        'Confess quickly where drift is showing up rather than spiritualizing it away.',
        'Pair Scripture with one concrete act of obedience this week.',
      ],
    },
  },
};

function round(value: number | null, precision = 1) {
  if (value == null || Number.isNaN(value)) return null;
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function domainStatus(score: number): FlourishingDomainScore['status'] {
  if (score >= 8) return 'thriving';
  if (score >= 6) return 'steady';
  return 'needs_attention';
}

export function overallMessage(score: number) {
  if (score >= 8) return "Thriving! You're flourishing across multiple life domains. Keep building on this strong foundation.";
  if (score >= 6) return "You're doing well overall, with clear opportunities to strengthen specific areas.";
  if (score >= 4) return "You're growing. Focus on the areas that need attention to move toward flourishing.";
  return "You're facing significant challenges. Let's build a compassionate, practical plan for growth.";
}

function domainMessage(label: string, score: number) {
  if (score >= 8) return `Excellent. You're thriving in ${label.toLowerCase()}. Keep stewarding this strength well.`;
  if (score >= 6) return `You're doing well in ${label.toLowerCase()}, but there is room to grow even stronger.`;
  return `This area needs attention. God may be inviting you to grow in ${label.toLowerCase()} with honesty and grace.`;
}

function domainSupport(domain: CoreFlourishingDomain, score: number) {
  if (score >= 8) return DOMAIN_SUPPORT[domain].thriving;
  if (score >= 6) return DOMAIN_SUPPORT[domain].steady;
  return DOMAIN_SUPPORT[domain].needs_attention;
}

export function enrichDomainScorePresentation(domainScore: FlourishingDomainScore): FlourishingDomainScore {
  const support = domainSupport(domainScore.domain, domainScore.score);
  return {
    ...domainScore,
    summary: domainScore.summary || domainMessage(domainScore.label, domainScore.score),
    scripture: domainScore.scripture ?? { reference: support.reference, text: support.text },
    tips: Array.isArray(domainScore.tips) && domainScore.tips.length > 0 ? domainScore.tips : support.tips,
  };
}

function calculateComparison(current: number, previous: number | null, average90d: number | null) {
  return {
    delta_from_previous: previous == null ? null : round(current - previous),
    delta_from_90d_average: average90d == null ? null : round(current - average90d),
  };
}

export function scoreAssessment({
  responses,
  questions = DEFAULT_FLOURISHING_QUESTIONS,
  previousDomainScores,
  previousIndex,
  previousOverallWellbeing,
  average90dIndex,
  average90dDomainScores,
}: {
  responses: FlourishingResponseMap;
  questions?: AssessmentQuestion[];
  previousDomainScores?: Partial<Record<CoreFlourishingDomain, number | null>>;
  previousIndex?: number | null;
  previousOverallWellbeing?: number | null;
  average90dIndex?: number | null;
  average90dDomainScores?: Partial<Record<CoreFlourishingDomain, number | null>>;
}) {
  const domainQuestions = questions.filter((question) => question.domain !== 'overall_wellbeing');
  const grouped = new Map<CoreFlourishingDomain, number[]>();
  const wellbeingValues: number[] = [];

  for (const question of domainQuestions) {
    const value = responses[question.question_id];
    if (typeof value !== 'number') continue;
    const domain = question.domain as CoreFlourishingDomain;
    const existing = grouped.get(domain) ?? [];
    existing.push(value);
    grouped.set(domain, existing);
  }

  for (const question of questions) {
    if (question.domain !== 'overall_wellbeing') continue;
    const value = responses[question.question_id];
    if (typeof value === 'number') wellbeingValues.push(value);
  }

  const domainScores = (Object.keys(FLOURISHING_DOMAIN_LABELS) as CoreFlourishingDomain[]).map((domain) => {
    const score = round(average(grouped.get(domain) ?? []), 2) ?? 0;
    const previous = previousDomainScores?.[domain] ?? null;
    const average90d = average90dDomainScores?.[domain] ?? null;
    const comparisons = calculateComparison(score, previous, average90d);
    const label = FLOURISHING_DOMAIN_LABELS[domain];
    const support = domainSupport(domain, score);

    return {
      domain,
      label,
      score,
      display_score: round(score, 1) ?? 0,
      previous_score: previous == null ? null : round(previous, 1),
      delta_from_previous: comparisons.delta_from_previous,
      average_90d: average90d == null ? null : round(average90d, 1),
      delta_from_90d_average: comparisons.delta_from_90d_average,
      status: domainStatus(score),
      summary: domainMessage(label, score),
      scripture: { reference: support.reference, text: support.text },
      tips: support.tips,
    } satisfies FlourishingDomainScore;
  });

  const flourishingIndex = round(average(domainScores.map((item) => item.score)), 2) ?? 0;
  const overallWellbeingScore = wellbeingValues.length ? round(average(wellbeingValues), 2) : null;
  const indexComparisons = calculateComparison(flourishingIndex, previousIndex ?? null, average90dIndex ?? null);

  const strongestDomains = domainScores
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((item) => item.domain);

  const growthDomains = domainScores
    .slice()
    .sort((a, b) => a.score - b.score)
    .slice(0, 2)
    .map((item) => item.domain);

  const discrepancyFlags: string[] = [];
  if (overallWellbeingScore != null && overallWellbeingScore + 1.2 < flourishingIndex) {
    discrepancyFlags.push('Overall sentiment is lagging behind the objective domain scores.');
  }
  if (overallWellbeingScore != null && overallWellbeingScore - 1.2 > flourishingIndex) {
    discrepancyFlags.push('Overall sentiment is stronger than the domain details suggest.');
  }
  if (previousOverallWellbeing != null && overallWellbeingScore != null && overallWellbeingScore - previousOverallWellbeing <= -1) {
    discrepancyFlags.push('Overall well-being sentiment has dropped meaningfully since the previous assessment.');
  }

  const interpretation: FlourishingInterpretation = {
    flourishing_index: flourishingIndex,
    display_index: round(flourishingIndex, 1) ?? 0,
    overall_message: overallMessage(flourishingIndex),
    strongest_domains: strongestDomains,
    growth_domains: growthDomains,
    discrepancy_flags: discrepancyFlags,
    overall_wellbeing_score: overallWellbeingScore == null ? null : round(overallWellbeingScore, 1),
    previous_index: previousIndex == null ? null : round(previousIndex, 1),
    delta_from_previous: indexComparisons.delta_from_previous,
    average_90d: average90dIndex == null ? null : round(average90dIndex, 1),
    delta_from_90d_average: indexComparisons.delta_from_90d_average,
  };

  return {
    domainScores,
    interpretation,
  };
}
