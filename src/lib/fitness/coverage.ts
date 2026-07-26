// ============================================================
// MOVEMENT COVERAGE MODEL
//
// Answers a longevity question, not a weekly one: is your training well-rounded
// across everything a body needs to stay resilient (Galpin) — or have whole
// attributes quietly gone months without a stimulus?
//
//   "You haven't loaded anything fast in 7 months; your program is entirely
//    sagittal-plane."
//
// This is the surface that catches that. It scores nine attributes by RECENCY
// and VOLUME over a months-to-years window, and flags the ones thinning out.
//
// Pure functions, no Supabase, no clock reads except the reference date passed
// in — same contract as program-rules.ts, so it is trivially testable and runs
// server-side or in the browser.
//
// Design choices that matter:
//  - Missing metadata is UNKNOWN, never ABSENT. An un-tagged exercise cannot
//    fabricate a coverage gap; it simply does not contribute evidence.
//  - Staleness thresholds are per-attribute and generous, because the point is
//    "haven't done this in months", not "skipped it this week".
//  - 'not_tracked' is a distinct status from 'absent'. If nothing in the data
//    can speak to an attribute, we say so rather than showing a false zero.
// ============================================================

export type CoverageAttribute =
  | 'strength'
  | 'muscle_mass'
  | 'muscular_endurance'
  | 'aerobic_capacity'
  | 'aerobic_base'
  | 'mobility'
  | 'power_speed'
  | 'balance'
  | 'plane_frontal'
  | 'plane_transverse';

export type CoverageStatus =
  | 'strong' // trained within cadence, with volume
  | 'maintained' // trained within cadence
  | 'thinning' // past cadence, under staleness
  | 'stale' // long overdue but seen in window
  | 'absent' // never in window, though it could have been detected
  | 'not_tracked'; // no data can speak to this attribute yet

// ---------- Inputs (deliberately loose, mirrors the DB rows) ----------

export type ExerciseMeta = {
  id: string;
  category?: string | null;
  velocity_intent?: string | null;
  movement_planes?: string[] | null;
  is_unilateral?: boolean | null;
  trains_balance?: boolean | null;
  trains_mobility?: boolean | null;
};

export type CoverageSet = {
  exercise_id: string | null;
  date: string; // ISO date of the workout
  reps: number | null;
  set_type?: string | null;
};

export type CoverageCardio = {
  date: string;
  zone1_min?: number | null;
  zone2_min?: number | null;
  zone3_min?: number | null;
  zone4_min?: number | null;
  duration_min?: number | null;
};

export type CoverageInputs = {
  sets: CoverageSet[];
  cardio: CoverageCardio[];
  exercises: ExerciseMeta[];
  /** ISO date the window ends on (today). Passed in so the model stays pure. */
  referenceDate: string;
  /** Window length. Galpin's framing is months-to-years; default 6 months. */
  windowMonths?: number;
};

// ---------- Output ----------

export type AttributeCoverage = {
  attribute: CoverageAttribute;
  label: string;
  status: CoverageStatus;
  /** Most recent date this attribute received a stimulus, within the window. */
  lastTrained: string | null;
  daysSince: number | null;
  /** Distinct days in the window that contributed to this attribute. */
  daysInWindow: number;
  /** One line for the UI, phrased for the user. */
  note: string;
};

export type CoverageReport = {
  referenceDate: string;
  windowMonths: number;
  attributes: AttributeCoverage[];
  /** Attributes at 'stale' or 'absent' — the ones worth acting on. */
  gaps: CoverageAttribute[];
};

// ---------- Per-attribute cadence (days) ----------
// cadence  = trained at least this often => maintained
// stale-at = beyond this => stale (between the two => thinning)
// Generous by design: this is a longevity view, not weekly compliance.

const CADENCE: Record<CoverageAttribute, { label: string; cadenceDays: number; staleDays: number }> = {
  strength:           { label: 'Strength',            cadenceDays: 10, staleDays: 42 },
  muscle_mass:        { label: 'Muscle mass',         cadenceDays: 10, staleDays: 42 },
  muscular_endurance: { label: 'Muscular endurance',  cadenceDays: 14, staleDays: 60 },
  aerobic_capacity:   { label: 'Aerobic capacity',    cadenceDays: 10, staleDays: 42 },
  aerobic_base:       { label: 'Aerobic base (Z1–2)', cadenceDays: 10, staleDays: 42 },
  mobility:           { label: 'Mobility / ROM',      cadenceDays: 10, staleDays: 42 },
  power_speed:        { label: 'Power / speed',       cadenceDays: 14, staleDays: 60 },
  balance:            { label: 'Balance / proprioception', cadenceDays: 14, staleDays: 60 },
  plane_frontal:      { label: 'Frontal-plane work',  cadenceDays: 21, staleDays: 90 },
  plane_transverse:   { label: 'Transverse (rotation)', cadenceDays: 21, staleDays: 90 },
};

// Attributes that depend on exercise metadata to be detectable at all. When no
// exercise in the data carries the relevant tag, we cannot distinguish "absent"
// from "untagged", so these report 'not_tracked' rather than 'absent'.
const METADATA_DEPENDENT: CoverageAttribute[] = [
  'power_speed',
  'balance',
  'plane_frontal',
  'plane_transverse',
];

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO.slice(0, 10)}T00:00:00Z`).getTime();
  const to = new Date(`${toISO.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

/**
 * Which attributes does a single resistance set contribute to?
 * Strength/muscle/endurance come from rep range; the rest come from the
 * exercise's metadata (null metadata contributes nothing, never a false zero).
 */
function attributesForSet(set: CoverageSet, meta: ExerciseMeta | undefined): CoverageAttribute[] {
  const hits: CoverageAttribute[] = [];
  // Warmups and cooldowns are not a training stimulus for these attributes.
  if (set.set_type === 'warmup' || set.set_type === 'cooldown') return hits;

  const reps = set.reps;
  if (typeof reps === 'number' && reps > 0) {
    if (reps <= 6) hits.push('strength');
    if (reps >= 6 && reps <= 15) hits.push('muscle_mass');
    if (reps > 15) hits.push('muscular_endurance');
  }

  if (!meta) return hits;

  if (meta.velocity_intent === 'power') hits.push('power_speed');
  if (meta.trains_balance || meta.is_unilateral) hits.push('balance');
  if (meta.trains_mobility || meta.category === 'mobility') hits.push('mobility');

  const planes = meta.movement_planes ?? [];
  if (planes.includes('frontal')) hits.push('plane_frontal');
  if (planes.includes('transverse')) hits.push('plane_transverse');

  return hits;
}

function statusFor(
  attribute: CoverageAttribute,
  daysSince: number | null,
  daysInWindow: number,
  detectable: boolean
): CoverageStatus {
  if (!detectable) return 'not_tracked';
  if (daysSince === null) return 'absent';
  const { cadenceDays, staleDays } = CADENCE[attribute];
  if (daysSince > staleDays) return 'stale';
  if (daysSince > cadenceDays) return 'thinning';
  // Within cadence: "strong" when there is repeated exposure, else "maintained".
  return daysInWindow >= 3 ? 'strong' : 'maintained';
}

function noteFor(c: Omit<AttributeCoverage, 'note'>): string {
  switch (c.status) {
    case 'not_tracked':
      return 'No tagged exercises can measure this yet — tag your lifts to light it up.';
    case 'absent':
      return `Not trained in this window.`;
    case 'stale':
      return `Last trained ${c.daysSince} days ago — long overdue.`;
    case 'thinning':
      return `Last trained ${c.daysSince} days ago — starting to thin out.`;
    case 'maintained':
      return `Trained ${c.daysSince === 0 ? 'today' : `${c.daysSince}d ago`}, but only on ${c.daysInWindow} day${c.daysInWindow === 1 ? '' : 's'}.`;
    case 'strong':
      return `Well covered — ${c.daysInWindow} days in the window, last ${c.daysSince === 0 ? 'today' : `${c.daysSince}d ago`}.`;
  }
}

/**
 * Build the coverage report from raw history.
 * Everything is derived deterministically; no AI, no I/O.
 */
export function computeCoverage(inputs: CoverageInputs): CoverageReport {
  const windowMonths = inputs.windowMonths ?? 6;
  const ref = inputs.referenceDate.slice(0, 10);
  const windowStart = new Date(`${ref}T00:00:00Z`);
  windowStart.setUTCMonth(windowStart.getUTCMonth() - windowMonths);
  const windowStartISO = windowStart.toISOString().slice(0, 10);

  const byId = new Map<string, ExerciseMeta>();
  for (const ex of inputs.exercises) byId.set(ex.id, ex);

  // Is each metadata-dependent attribute even measurable? True if any exercise
  // in the library carries the relevant tag.
  const detectable = new Set<CoverageAttribute>([
    'strength',
    'muscle_mass',
    'muscular_endurance',
    'aerobic_capacity',
    'aerobic_base',
    'mobility',
  ]);
  for (const ex of inputs.exercises) {
    if (ex.velocity_intent === 'power') detectable.add('power_speed');
    if (ex.trains_balance || ex.is_unilateral) detectable.add('balance');
    if ((ex.movement_planes ?? []).includes('frontal')) detectable.add('plane_frontal');
    if ((ex.movement_planes ?? []).includes('transverse')) detectable.add('plane_transverse');
  }
  // Mobility is detectable if any exercise is tagged mobility OR category mobility.
  if (inputs.exercises.some(e => e.trains_mobility || e.category === 'mobility')) {
    detectable.add('mobility');
  }

  // Accumulate, per attribute, the set of distinct dates it was trained.
  const dates = new Map<CoverageAttribute, Set<string>>();
  const addDate = (attr: CoverageAttribute, dateISO: string) => {
    if (dateISO < windowStartISO || dateISO > ref) return; // clamp to window
    if (!dates.has(attr)) dates.set(attr, new Set());
    dates.get(attr)!.add(dateISO);
  };

  for (const set of inputs.sets) {
    const meta = set.exercise_id ? byId.get(set.exercise_id) : undefined;
    for (const attr of attributesForSet(set, meta)) addDate(attr, set.date.slice(0, 10));
  }

  for (const c of inputs.cardio) {
    const d = c.date.slice(0, 10);
    const z12 = (c.zone1_min ?? 0) + (c.zone2_min ?? 0);
    const z34 = (c.zone3_min ?? 0) + (c.zone4_min ?? 0);
    if (z12 > 0) addDate('aerobic_base', d);
    if (z34 > 0) addDate('aerobic_capacity', d);
    // A cardio session with no zone breakdown still counts as aerobic base if it
    // had meaningful duration — better than losing the signal entirely.
    if (z12 === 0 && z34 === 0 && (c.duration_min ?? 0) >= 20) addDate('aerobic_base', d);
  }

  const attributes: AttributeCoverage[] = (Object.keys(CADENCE) as CoverageAttribute[]).map(attr => {
    const set = dates.get(attr);
    const daysInWindow = set?.size ?? 0;
    const lastTrained = set && set.size > 0 ? [...set].sort().at(-1)! : null;
    const daysSince = lastTrained ? daysBetween(lastTrained, ref) : null;
    const isDetectable = detectable.has(attr);
    const status = statusFor(attr, daysSince, daysInWindow, isDetectable);
    const base = { attribute: attr, label: CADENCE[attr].label, status, lastTrained, daysSince, daysInWindow };
    return { ...base, note: noteFor(base) };
  });

  const gaps = attributes
    .filter(a => a.status === 'stale' || a.status === 'absent')
    .map(a => a.attribute);

  return { referenceDate: ref, windowMonths, attributes, gaps };
}

/** Order for display: worst first, so gaps surface at the top. */
export function sortByUrgency(attributes: AttributeCoverage[]): AttributeCoverage[] {
  const rank: Record<CoverageStatus, number> = {
    absent: 0,
    stale: 1,
    thinning: 2,
    not_tracked: 3,
    maintained: 4,
    strong: 5,
  };
  return [...attributes].sort((a, b) => {
    const d = rank[a.status] - rank[b.status];
    if (d !== 0) return d;
    return (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity);
  });
}

export { METADATA_DEPENDENT, CADENCE };
