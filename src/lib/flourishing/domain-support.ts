/**
 * Scripture and practical tips for each Flourishing domain, by band.
 *
 * Split out of scoring.ts so the dashboard's pillar suggestions can use the
 * same content without pulling in the question bank, and so it runs under
 * `node --test`. Rule-based: nothing here calls a model.
 */

import type { CoreFlourishingDomain } from './types.ts';

export type DomainBand = 'thriving' | 'steady' | 'needs_attention';
export type DomainSupportEntry = { reference: string; text: string; tips: string[] };

export const DOMAIN_SUPPORT: Record<CoreFlourishingDomain, Record<DomainBand, DomainSupportEntry>> = {
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

/** Same thresholds as the survey's domain status: 8+ thriving, 6+ steady. */
export function domainBand(score: number): DomainBand {
  if (score >= 8) return 'thriving';
  if (score >= 6) return 'steady';
  return 'needs_attention';
}

export function domainSupport(domain: CoreFlourishingDomain, score: number): DomainSupportEntry {
  return DOMAIN_SUPPORT[domain][domainBand(score)];
}
