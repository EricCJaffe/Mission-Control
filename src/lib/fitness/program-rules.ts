// ============================================================
// PROGRAM DESIGN RULES — deterministic validators
//
// These encode well-established program-design heuristics as CODE, not as
// prompt text. The distinction matters: an LLM asked to "apply progressive
// overload" will produce something that *reads* correct without being
// checkable. These functions make a plan falsifiable — you can point at the
// exact day that breaks the 72-hour rule.
//
// Division of labour:
//   - This module decides whether a plan is structurally sound.
//   - The LLM arranges exercises and writes the prose.
// The model proposes; these rules dispose.
//
// Everything here is a pure function. No Supabase, no fetch, no clock reads
// except where explicitly passed in — so it is trivially testable and can run
// on the server during generation or in the browser for live feedback.
// ============================================================

// ---------- Domain types ----------

export type TrainingGoal =
  | 'hypertrophy'
  | 'strength'
  | 'fat_loss'
  | 'endurance'
  | 'longevity'
  | 'hybrid'
  | 'maintenance';

export type RuleSeverity = 'error' | 'warning' | 'info';

/** A single rule violation, phrased so it can be shown to the user verbatim. */
export type RuleFinding = {
  /** Stable machine id, e.g. '72-hour'. Safe to key UI off. */
  rule: string;
  severity: RuleSeverity;
  /** One line, no jargon. */
  summary: string;
  /** What specifically is wrong, naming days/exercises. */
  detail: string;
  /** Concrete change that would resolve it. */
  remedy: string;
};

export type RuleReport = {
  goal: TrainingGoal;
  /** False if any finding has severity 'error'. */
  passed: boolean;
  findings: RuleFinding[];
  /** Rules that ran and produced no findings — useful for showing what was checked. */
  checksPassed: string[];
};

export type PlannedExercise = {
  exercise_id?: string;
  exercise_name: string;
  sets?: number;
  /** "8-10", "5", "AMRAP", "30s" — free-form by design; parsed defensively. */
  target_reps?: string | number;
  target_weight_pct?: number;
  rest_seconds?: number;
  /** Reps in reserve. 0 = to failure. */
  rir?: number;
  muscle_groups?: string[];
  category?: string;
  is_compound?: boolean;
  notes?: string;
};

export type PlannedDay = {
  /** 1-7. Position within the weekly microcycle, not a calendar date. */
  day_number: number;
  day_label?: string;
  workout_type?: string;
  target_duration_min?: number;
  target_tss?: number;
  /** Subjective/prescribed effort, if the plan declares one. */
  intensity?: 'easy' | 'moderate' | 'hard' | 'max';
  exercises?: PlannedExercise[];
};

export type ProgressionMechanism = 'load' | 'reps' | 'sets' | 'range_of_motion' | 'frequency';

export type ProgramPlan = {
  goal: TrainingGoal;
  weeks?: number;
  weekly_template: PlannedDay[];
  deload_weeks?: number[];
  /** Structured overload spec. Free-text `progression_notes` does not count. */
  progression?: {
    mechanisms: ProgressionMechanism[];
    /** How often the prescription increases, in weeks. */
    cadence_weeks: number;
    notes?: string;
  };
  /**
   * Non-gym activity the plan expects, for goals where total expenditure
   * matters more than any single session.
   */
  weekly_activity?: {
    /** Days with deliberate movement (walking, standing desk, stairs). */
    active_days?: number;
    /** Days with a session hard enough to break a real sweat. */
    sweat_days?: number;
    /** Days at genuinely high effort. */
    hard_days?: number;
    /** Days with one long, low-intensity effort. */
    long_days?: number;
  };
};

export type RuleOptions = {
  /**
   * Resolve muscle groups for an exercise when the plan does not inline them.
   * Typically backed by the `exercises` table.
   */
  resolveMuscleGroups?: (exercise: PlannedExercise) => string[] | undefined;
};

// ---------- Parsing helpers ----------

export type RepRange = { min: number; max: number };

/**
 * Parse a rep prescription into a numeric range.
 * Returns null for time-based ("30s"), open-ended ("AMRAP"), or unparseable
 * values — callers must treat null as "not a countable rep scheme" rather than
 * as zero, or time-based cardio work will trip strength/hypertrophy rules.
 */
export function parseRepRange(value: string | number | undefined): RepRange | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? { min: value, max: value } : null;
  }

  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  // Time-based or open-ended prescriptions are not rep counts.
  if (/\d\s*(s|sec|second|m|min|minute)\b/.test(raw)) return null;
  if (/amrap|failure|max reps/.test(raw)) return null;

  const range = raw.match(/^(\d+)\s*[-–—to]+\s*(\d+)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min: Math.min(min, max), max: Math.max(min, max) };
  }

  const single = raw.match(/^(\d+)$/);
  if (single) {
    const n = Number(single[1]);
    return n > 0 ? { min: n, max: n } : null;
  }

  return null;
}

function muscleGroupsOf(ex: PlannedExercise, opts: RuleOptions): string[] {
  const inline = ex.muscle_groups?.filter(Boolean) ?? [];
  if (inline.length > 0) return inline.map(m => m.toLowerCase());
  const resolved = opts.resolveMuscleGroups?.(ex) ?? [];
  return resolved.filter(Boolean).map(m => m.toLowerCase());
}

function dayLabel(day: PlannedDay): string {
  return day.day_label?.trim() || day.workout_type?.trim() || `Day ${day.day_number}`;
}

/** Days that contain at least one prescribed exercise. */
function trainingDays(plan: ProgramPlan): PlannedDay[] {
  return plan.weekly_template.filter(d => (d.exercises?.length ?? 0) > 0);
}

// ---------- Rule: 72-hour rule (hypertrophy) ----------

/**
 * Every muscle you want to grow should receive mechanical tension at least
 * every ~72 hours. Because the weekly template repeats, the gap is measured
 * circularly: training a muscle on day 6 and again on day 2 of the next week
 * is a 3-day gap, not a 4-day one.
 */
export function checkSeventyTwoHourRule(plan: ProgramPlan, opts: RuleOptions = {}): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const dayCount = 7;

  // muscle -> sorted day numbers on which it receives tension
  const byMuscle = new Map<string, Set<number>>();
  for (const day of plan.weekly_template) {
    for (const ex of day.exercises ?? []) {
      for (const muscle of muscleGroupsOf(ex, opts)) {
        if (!byMuscle.has(muscle)) byMuscle.set(muscle, new Set());
        byMuscle.get(muscle)!.add(day.day_number);
      }
    }
  }

  if (byMuscle.size === 0) {
    return [{
      rule: '72-hour',
      severity: 'warning',
      summary: 'Cannot verify training frequency per muscle',
      detail: 'No muscle groups are attached to the prescribed exercises, so the 72-hour rule could not be evaluated.',
      remedy: 'Populate muscle_groups on the exercises, or pass resolveMuscleGroups so the plan can be checked.',
    }];
  }

  for (const [muscle, daySet] of byMuscle) {
    const days = [...daySet].sort((a, b) => a - b);

    // Largest circular gap between consecutive stimuli.
    let maxGap: number;
    let gapStart: number;
    if (days.length === 1) {
      maxGap = dayCount;
      gapStart = days[0];
    } else {
      maxGap = 0;
      gapStart = days[0];
      for (let i = 0; i < days.length; i++) {
        const current = days[i];
        const next = days[(i + 1) % days.length];
        // Wrap around the end of the week for the final pair.
        const gap = i === days.length - 1 ? next + dayCount - current : next - current;
        if (gap > maxGap) {
          maxGap = gap;
          gapStart = current;
        }
      }
    }

    if (maxGap > 3) {
      findings.push({
        rule: '72-hour',
        severity: 'error',
        summary: `${muscle} goes ${maxGap} days without training`,
        detail:
          days.length === 1
            ? `${muscle} is trained only on day ${days[0]}, leaving a full week between stimuli.`
            : `${muscle} is trained on days ${days.join(', ')}. The longest gap is ${maxGap} days, starting after day ${gapStart}.`,
        remedy: `Add ${muscle} work within 3 days of day ${gapStart} — a second lighter exposure is enough; it does not need to be a full session.`,
      });
    }
  }

  return findings;
}

// ---------- Rule: proximity to failure (hypertrophy) ----------

/**
 * Sets taken far from failure do not generate enough tension to drive growth.
 * The workable band is roughly 1-3 reps in reserve by the last set.
 */
export function checkProximityToFailure(plan: ProgramPlan): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const withRir: PlannedExercise[] = [];
  const withoutRir: PlannedExercise[] = [];

  for (const day of plan.weekly_template) {
    for (const ex of day.exercises ?? []) {
      if (typeof ex.rir === 'number') withRir.push(ex);
      else withoutRir.push(ex);
    }
  }

  const total = withRir.length + withoutRir.length;
  if (total === 0) return findings;

  if (withRir.length === 0) {
    return [{
      rule: 'proximity-to-failure',
      severity: 'warning',
      summary: 'No effort target prescribed',
      detail: 'None of the exercises declare reps-in-reserve, so there is no way to tell whether sets are hard enough to drive growth.',
      remedy: 'Prescribe RIR (target 1-3 by the last set) on the primary lifts.',
    }];
  }

  const tooEasy = withRir.filter(ex => (ex.rir ?? 0) > 3);
  if (tooEasy.length > 0) {
    findings.push({
      rule: 'proximity-to-failure',
      severity: 'error',
      summary: `${tooEasy.length} exercise${tooEasy.length === 1 ? '' : 's'} stop too far from failure`,
      detail: `${tooEasy.map(e => `${e.exercise_name} (RIR ${e.rir})`).join(', ')} leave 4+ reps in reserve.`,
      remedy: 'Bring the last working set to 1-3 reps in reserve, or add load.',
    });
  }

  return findings;
}

// ---------- Rule: 3-to-5 (strength / power) ----------

const THREE_TO_FIVE = { min: 3, max: 5 };

/**
 * A long-standing strength heuristic: 3-5 days per week, 3-5 exercises per
 * session, 3-5 sets of 3-5 reps, resting 3-5 minutes. It is a band, not a
 * prescription — the point is that strength is a skill practised heavy and
 * fresh, so volume stays low and rest stays long.
 *
 * Time-based and open-ended prescriptions (cardio finishers, carries) are
 * skipped rather than failed.
 */
export function checkThreeToFiveRule(plan: ProgramPlan): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const days = trainingDays(plan);

  if (days.length < THREE_TO_FIVE.min || days.length > THREE_TO_FIVE.max) {
    findings.push({
      rule: '3-5-days',
      severity: days.length < THREE_TO_FIVE.min ? 'error' : 'warning',
      summary: `${days.length} training days falls outside the 3-5 band`,
      detail: `Strength is skill practice — it rewards frequency at low volume. This plan schedules ${days.length} lifting days.`,
      remedy: days.length < THREE_TO_FIVE.min
        ? 'Add a day. Sessions can be short (3 exercises, 3 sets) and still build strength.'
        : 'Drop a day, or make the extra days explicitly submaximal technique work.',
    });
  }

  for (const day of days) {
    const label = dayLabel(day);
    const exercises = day.exercises ?? [];

    if (exercises.length > THREE_TO_FIVE.max) {
      findings.push({
        rule: '3-5-exercises',
        severity: 'warning',
        summary: `${label} has ${exercises.length} exercises`,
        detail: `Strength sessions lose quality past ~5 exercises; fatigue degrades the skill you are trying to practise.`,
        remedy: `Cut ${label} to 5 or fewer, moving accessory work to a separate day.`,
      });
    }

    for (const ex of exercises) {
      if (typeof ex.sets === 'number' && (ex.sets < THREE_TO_FIVE.min || ex.sets > THREE_TO_FIVE.max)) {
        findings.push({
          rule: '3-5-sets',
          severity: 'warning',
          summary: `${ex.exercise_name} prescribes ${ex.sets} sets`,
          detail: `On ${label}. The 3-5 band keeps total volume low enough to stay fresh and heavy.`,
          remedy: `Set ${ex.exercise_name} to 3-5 working sets.`,
        });
      }

      const reps = parseRepRange(ex.target_reps);
      // null = time-based or AMRAP; not a countable rep scheme, so skip it.
      if (reps && (reps.max > THREE_TO_FIVE.max || reps.min < 1)) {
        findings.push({
          rule: '3-5-reps',
          severity: reps.max > 8 ? 'error' : 'warning',
          summary: `${ex.exercise_name} prescribes ${ex.target_reps} reps`,
          detail: `On ${label}. Sets above ~5 reps drift toward hypertrophy work rather than strength skill.`,
          remedy: `Drop ${ex.exercise_name} to 3-5 reps and raise the load.`,
        });
      }

      if (typeof ex.rest_seconds === 'number' && ex.rest_seconds < 180) {
        findings.push({
          rule: '3-5-rest',
          severity: 'warning',
          summary: `${ex.exercise_name} rests only ${ex.rest_seconds}s`,
          detail: `On ${label}. Short rest accumulates fatigue, and fatigue degrades technique — which is the thing being trained.`,
          remedy: `Rest 3-5 minutes (180-300s) between heavy sets of ${ex.exercise_name}.`,
        });
      }
    }
  }

  return findings;
}

// ---------- Rule: 5-4-3-2-1 (fat loss) ----------

/**
 * Fat loss is driven by total expenditure and, above all, adherence — so the
 * check is about the shape of the whole week rather than any session:
 *   5 days active · 4 days structured exercise · 3 days a real sweat ·
 *   2 days genuinely hard · 1 day long and low-intensity.
 */
export function checkFiveFourThreeTwoOne(plan: ProgramPlan): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const activity = plan.weekly_activity;
  const workoutDays = trainingDays(plan).length;

  const targets: Array<{
    id: string;
    label: string;
    target: number;
    actual: number | undefined;
    why: string;
    fix: string;
  }> = [
    {
      id: '5-active',
      label: 'active days',
      target: 5,
      actual: activity?.active_days,
      why: 'Non-exercise movement is a large share of daily expenditure.',
      fix: 'Add walking, stairs, or standing time on non-training days — it does not need to be a workout.',
    },
    {
      id: '4-workouts',
      label: 'structured workouts',
      target: 4,
      actual: workoutDays,
      why: 'Structured sessions are what make the stimulus repeatable.',
      fix: 'Schedule a fourth session, even a short one.',
    },
    {
      id: '3-sweat',
      label: 'sweat days',
      target: 3,
      actual: activity?.sweat_days,
      why: 'A proxy for working hard enough to matter, not a goal in itself.',
      fix: 'Make three of the sessions hard enough to break a real sweat.',
    },
    {
      id: '2-hard',
      label: 'hard days',
      target: 2,
      actual: activity?.hard_days ?? plan.weekly_template.filter(d => d.intensity === 'hard' || d.intensity === 'max').length,
      why: 'High-intensity work drives adaptation the easy days cannot.',
      fix: 'Add intervals, a hard group class, or sled/hill work.',
    },
    {
      id: '1-long',
      label: 'long day',
      target: 1,
      actual: activity?.long_days,
      why: 'One long low-intensity effort builds the aerobic base.',
      fix: 'Add a hike, long ride, or extended walk once a week.',
    },
  ];

  for (const t of targets) {
    if (t.actual === undefined) {
      findings.push({
        rule: t.id,
        severity: 'info',
        summary: `${t.label} not specified`,
        detail: `The plan does not declare how many ${t.label} it expects (target: ${t.target}). ${t.why}`,
        remedy: `Set weekly_activity so adherence against the ${t.target} ${t.label} target can be tracked.`,
      });
      continue;
    }
    if (t.actual < t.target) {
      findings.push({
        rule: t.id,
        severity: t.actual < t.target - 1 ? 'error' : 'warning',
        summary: `${t.actual} ${t.label}, target ${t.target}`,
        detail: t.why,
        remedy: t.fix,
      });
    }
  }

  return findings;
}

// ---------- Rule: progressive overload ----------

/**
 * The most common reason a plan stops working is that nothing about it ever
 * increases. Load-only progression stalls within about four to five weeks, so
 * a plan should name more than one mechanism. Weekly increases are usually
 * unrealistic; every two to three weeks is fine.
 */
export function checkProgressiveOverload(plan: ProgramPlan): RuleFinding[] {
  const findings: RuleFinding[] = [];
  const progression = plan.progression;

  if (!progression || progression.mechanisms.length === 0) {
    return [{
      rule: 'progressive-overload',
      severity: 'error',
      summary: 'No progression mechanism declared',
      detail: 'The plan does not specify how the prescription increases over time. Absence of structured overload is the single most common cause of plateau.',
      remedy: 'Declare at least one mechanism (load, reps, sets, range_of_motion, frequency) and a cadence in weeks.',
    }];
  }

  if (progression.mechanisms.length === 1 && progression.mechanisms[0] === 'load') {
    findings.push({
      rule: 'progressive-overload',
      severity: 'warning',
      summary: 'Load is the only progression mechanism',
      detail: 'Adding weight every cycle works for roughly four to five weeks, then stalls — there is no more weight to add.',
      remedy: 'Pair load with reps or sets so progression can continue once load stalls.',
    });
  }

  const weeks = plan.weeks ?? 0;
  if (progression.cadence_weeks > 3) {
    findings.push({
      rule: 'progressive-overload',
      severity: 'warning',
      summary: `Progression only every ${progression.cadence_weeks} weeks`,
      detail: 'Intervals longer than about three weeks leave adaptation on the table.',
      remedy: 'Tighten the cadence to every 2-3 weeks.',
    });
  }
  if (progression.cadence_weeks < 1) {
    findings.push({
      rule: 'progressive-overload',
      severity: 'error',
      summary: 'Progression cadence is not a whole week',
      detail: `cadence_weeks is ${progression.cadence_weeks}.`,
      remedy: 'Set a cadence of 1-3 weeks.',
    });
  }

  if (weeks >= 6 && (!plan.deload_weeks || plan.deload_weeks.length === 0)) {
    findings.push({
      rule: 'deload',
      severity: 'warning',
      summary: `${weeks}-week block with no deload`,
      detail: 'Blocks longer than about six weeks without a planned deload tend to accumulate fatigue faster than fitness.',
      remedy: 'Add a deload every 3-4 weeks.',
    });
  }

  return findings;
}

// ---------- Rule: push/pull balance ----------

/**
 * Selecting only pressing movements (or only pulling) is a common way for an
 * otherwise reasonable plan to create a problem. Checked as a ratio so that
 * deliberate emphasis is a warning, not a failure.
 */
export function checkPushPullBalance(plan: ProgramPlan, opts: RuleOptions = {}): RuleFinding[] {
  let push = 0;
  let pull = 0;

  for (const day of plan.weekly_template) {
    for (const ex of day.exercises ?? []) {
      const category = (ex.category ?? '').toLowerCase();
      const muscles = muscleGroupsOf(ex, opts);
      const isPush = category === 'push' || muscles.some(m => /chest|triceps|shoulder|quad/.test(m));
      const isPull = category === 'pull' || muscles.some(m => /back|lat|biceps|rhomboid|hamstring|glute/.test(m));
      // An exercise can be neither (core, cardio, mobility); count each side once.
      if (isPush) push += ex.sets ?? 1;
      if (isPull) pull += ex.sets ?? 1;
    }
  }

  if (push === 0 && pull === 0) return [];

  const total = push + pull;
  const ratio = total === 0 ? 1 : push / total;

  if (pull === 0) {
    return [{
      rule: 'push-pull-balance',
      severity: 'error',
      summary: 'Plan contains pressing but no pulling',
      detail: `${push} pressing sets and no pulling sets across the week.`,
      remedy: 'Add rowing or pulldown work — roughly matching pressing volume.',
    }];
  }
  if (push === 0) {
    return [{
      rule: 'push-pull-balance',
      severity: 'error',
      summary: 'Plan contains pulling but no pressing',
      detail: `${pull} pulling sets and no pressing sets across the week.`,
      remedy: 'Add a pressing movement to balance the week.',
    }];
  }
  if (ratio > 0.65 || ratio < 0.35) {
    const heavier = ratio > 0.5 ? 'pressing' : 'pulling';
    return [{
      rule: 'push-pull-balance',
      severity: 'warning',
      summary: `Week is ${Math.round((ratio > 0.5 ? ratio : 1 - ratio) * 100)}% ${heavier}`,
      detail: `${push} pressing sets vs ${pull} pulling sets.`,
      remedy: `Even the ratio unless the ${heavier} emphasis is deliberate.`,
    }];
  }

  return [];
}

// ---------- Frequency realism ----------

export type FrequencyRecommendation = {
  /** What the plan should actually be built around. */
  programmed: number;
  /** What the user said they could do. */
  stated: number;
  /** Sessions per week actually completed, from logged history. */
  observed: number | null;
  reason: string;
  /** True when programmed differs from stated — surface an override in the UI. */
  adjusted: boolean;
};

/**
 * Decide the frequency to build the plan around.
 *
 * A plan built for four days where one is reliably missed is worse than a
 * three-day plan completed — the misses are demoralising and usually land on
 * the same session every week. So the default is to trust logged behaviour
 * over stated intent, treating the stated number as a ceiling. Where there is
 * no history, fall back to stated-minus-one.
 *
 * Always returns `adjusted` so the caller can show the user what happened and
 * offer an override rather than silently overriding them.
 */
export function deriveProgrammedFrequency(
  stated: number,
  observedSessionsPerWeek: number | null,
  opts: { minimum?: number } = {}
): FrequencyRecommendation {
  const minimum = opts.minimum ?? 1;
  const clamp = (n: number) => Math.max(minimum, Math.min(stated, Math.round(n)));

  if (observedSessionsPerWeek === null || !Number.isFinite(observedSessionsPerWeek)) {
    const programmed = Math.max(minimum, stated - 1);
    return {
      programmed,
      stated,
      observed: null,
      adjusted: programmed !== stated,
      reason:
        `No logged history yet, so the plan is built for ${programmed} day${programmed === 1 ? '' : 's'} ` +
        `rather than ${stated}. A completed ${programmed}-day week beats a missed ${stated}-day week; ` +
        `extra sessions are a bonus, not a failure.`,
    };
  }

  const observed = observedSessionsPerWeek;
  const programmed = clamp(Math.floor(observed));

  if (programmed >= stated) {
    return {
      programmed: stated,
      stated,
      observed,
      adjusted: false,
      reason: `Logged history averages ${observed.toFixed(1)} sessions/week, which supports the ${stated} requested.`,
    };
  }

  return {
    programmed,
    stated,
    observed,
    adjusted: true,
    reason:
      `You asked for ${stated} days/week. Logged history averages ${observed.toFixed(1)}, ` +
      `so the plan is built for ${programmed}. This is deliberate — hitting every session of a ` +
      `${programmed}-day plan builds more than missing sessions from a ${stated}-day one.`,
  };
}

// ---------- Dispatcher ----------

/** Which rules apply to which goal. Hybrid runs both strength and hypertrophy. */
function rulesForGoal(goal: TrainingGoal): Array<(plan: ProgramPlan, opts: RuleOptions) => RuleFinding[]> {
  const hypertrophy = [checkSeventyTwoHourRule, checkProximityToFailure];
  const strength = [checkThreeToFiveRule];
  const universal = [checkProgressiveOverload, checkPushPullBalance];

  switch (goal) {
    case 'hypertrophy':
      return [...hypertrophy, ...universal];
    case 'strength':
      return [...strength, ...universal];
    case 'hybrid':
      return [...hypertrophy, ...strength, ...universal];
    case 'fat_loss':
      return [checkFiveFourThreeTwoOne, ...universal];
    case 'endurance':
    case 'longevity':
    case 'maintenance':
      return [...universal];
    default:
      return [...universal];
  }
}

/** Stable ids each rule function can emit, so `checksPassed` can be reported. */
const RULE_IDS: Record<string, string[]> = {
  checkSeventyTwoHourRule: ['72-hour'],
  checkProximityToFailure: ['proximity-to-failure'],
  checkThreeToFiveRule: ['3-5-days', '3-5-exercises', '3-5-sets', '3-5-reps', '3-5-rest'],
  checkFiveFourThreeTwoOne: ['5-active', '4-workouts', '3-sweat', '2-hard', '1-long'],
  checkProgressiveOverload: ['progressive-overload', 'deload'],
  checkPushPullBalance: ['push-pull-balance'],
};

/**
 * Run every rule that applies to the plan's goal.
 *
 * `passed` is false only when something is structurally wrong (severity
 * 'error'). Warnings are judgement calls worth surfacing but not worth
 * blocking on — the point is to inform the user, not to refuse to plan.
 */
export function validateProgram(plan: ProgramPlan, opts: RuleOptions = {}): RuleReport {
  const findings: RuleFinding[] = [];
  const checksPassed: string[] = [];

  for (const rule of rulesForGoal(plan.goal)) {
    const produced = rule(plan, opts);
    findings.push(...produced);

    const ids = RULE_IDS[rule.name] ?? [];
    const firedIds = new Set(produced.map(f => f.rule));
    for (const id of ids) {
      if (!firedIds.has(id)) checksPassed.push(id);
    }
  }

  const severityOrder: Record<RuleSeverity, number> = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    goal: plan.goal,
    passed: !findings.some(f => f.severity === 'error'),
    findings,
    checksPassed,
  };
}
