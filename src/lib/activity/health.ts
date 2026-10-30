/*
 * Health is never stored by the Decisions inbox nor written back to the
 * brain, Eric's or anyone's (Codex review, PR #81: the scrubber removes
 * identifiers, not health information). Shared by the box-side ingest
 * (scripts/sync/parse/decisions-inbox.ts) and the answer endpoint.
 *
 * A word list, so it over-matches on purpose: a false hit costs one card he
 * answers in the brain instead; a miss puts health data in a table.
 */
const HEALTH_RE = new RegExp(
  '\\b(?:' +
    [
      // care, records, regulation
      'health\\w*', 'medical\\w*', 'medic(?:ine|ation)s?', 'meds?', 'rx', 'phi', 'hipaa', 'patients?', 'clinic(?:al|s)?',
      'hospital\\w*', 'er visit', 'urgent care', 'diagnos[ie]s', 'diagnosed', 'symptoms?', 'treatment', 'prognosis',
      'doctors?', 'dr appt', 'physicians?', 'nurses?', 'specialist', 'appointment with dr', 'pharmac\\w*', 'prescri\\w*',
      'insurance claim', 'copay', 'deductible',
      // body and conditions
      'heart', 'cardi\\w*', 'blood', 'bp', 'cholesterol', 'a1c', 'glucose', 'insulin', 'diabet\\w*', 'cancer', 'tumou?r',
      'oncolog\\w*', 'biopsy', 'stroke', 'injur\\w*', 'fracture', 'pain', 'illness', 'sick', 'infection', 'covid', 'flu',
      'vaccin\\w*', 'allerg\\w*', 'asthma', 'pregnan\\w*', 'fertility', 'dental', 'dentist', 'eye exam', 'vision test',
      'hearing', 'sleep apnea', 'weight loss', 'bmi', 'genetic\\w*', 'dna', 'hormone\\w*', 'testosterone', 'thyroid',
      // tests and procedures
      'labs?', 'lab results?', 'bloodwork', 'mri', 'ct scan', 'pet scan', 'x-?ray', 'ultrasound', 'ecg', 'ekg', 'echo(?:cardiogram)?',
      'stress test', 'colonoscopy', 'surgery', 'surgical', 'procedure', 'physical therapy', 'pt session', 'rehab\\w*',
      // mind
      'mental', 'therap(?:y|ist|ies)', 'counsel(?:ing|or|ling)', 'psych\\w*', 'depress\\w*', 'anxiety', 'crisis', 'suicid\\w*',
      'self-?harm', 'addiction', 'recovery program', 'substance',
    ].join('|') +
    ')\\b',
  'i',
);

export function isHealth(...values: Array<string | null | undefined>): boolean {
  return values.some((v) => typeof v === 'string' && HEALTH_RE.test(v.replace(/[-_]/g, ' ')));
}

