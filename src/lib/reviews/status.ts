/**
 * Red, yellow, green — and the one rule that makes this module different.
 *
 * NO READING IS RED.
 *
 * Eric, 2026-09-20: "No reading would be red."
 *
 * `src/lib/status-colors.ts` deliberately renders a missing score GREY, and
 * its comment gives the reason: "the fastest way to make someone ignore a red
 * badge is to show it when nothing's wrong". That is correct for a dashboard
 * tile, which is a picture of how things ARE. A review is not a picture. It is
 * the moment where an area either reports or does not, and an area that does
 * not report is the single most reliable predictor that it has been dropped.
 *
 * The Honey Lake Operating System — the framework Foundation Stone runs every
 * engagement on — says this outright: red is "past the line, **or no reading
 * this month**". Using the same three words with different meanings in the
 * personal system and the client system would make the vocabulary useless in
 * both, so this module follows HLOS and the divergence is stated rather than
 * quietly introduced.
 *
 * `not_due` is the one thing that is neither. An area on a monthly cadence
 * inside a weekly cycle, or an area created after the period began, could not
 * have been read — that is not silence, it is absence, and it is excluded from
 * the verdict entirely rather than colored anything.
 *
 * Every level carries a label as well as a color: red/green color blindness
 * affects roughly 8% of men, so hue can never be the only signal.
 */

export const REVIEW_STATUSES = ['green', 'yellow', 'red', 'not_due'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && (REVIEW_STATUSES as readonly string[]).includes(value);
}

/** Worst-first. `rankOf` is what "the worst color wins" is implemented with. */
const RANK: Record<ReviewStatus, number> = { red: 3, yellow: 2, green: 1, not_due: 0 };

export function rankOf(status: ReviewStatus): number {
  return RANK[status];
}

export type ReviewStatusStyle = {
  status: ReviewStatus;
  /** The word. Always rendered — never rely on the color alone. */
  label: string;
  /** What it means as an ACTION, which is what HLOS defines these as. */
  meaning: string;
  border: string;
  bg: string;
  text: string;
  /** Solid fill for pills, bars and the trend strip. */
  solid: string;
  /** Hex, for SVG strokes and inline styles. */
  hex: string;
  /** A shape as well as a color, for the same reason the label exists. */
  glyph: string;
};

export const REVIEW_STATUS_STYLES: Record<ReviewStatus, ReviewStatusStyle> = {
  green: {
    status: 'green',
    label: 'Green',
    meaning: 'At or past the line. Nothing needed from this week.',
    border: 'border-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    solid: 'bg-emerald-600 text-white',
    hex: '#059669',
    glyph: '●',
  },
  yellow: {
    status: 'yellow',
    label: 'Yellow',
    meaning: 'Short of the line, or drifting toward it. Name the one thing that would fix it.',
    border: 'border-yellow-500',
    bg: 'bg-yellow-50',
    text: 'text-yellow-800',
    solid: 'bg-yellow-500 text-white',
    hex: '#eab308',
    glyph: '▲',
  },
  red: {
    status: 'red',
    label: 'Red',
    meaning: 'Past the line, or no reading at all. It goes on this week’s agenda.',
    border: 'border-rose-500',
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    solid: 'bg-rose-600 text-white',
    hex: '#e11d48',
    glyph: '■',
  },
  not_due: {
    status: 'not_due',
    label: 'Not due',
    meaning: 'Not read on this cadence. Excluded from the verdict.',
    border: 'border-slate-300',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    solid: 'bg-slate-400 text-white',
    hex: '#94a3b8',
    glyph: '–',
  },
};

export function styleFor(status: ReviewStatus): ReviewStatusStyle {
  return REVIEW_STATUS_STYLES[status];
}

export type Direction = 'higher_better' | 'lower_better';

export type Line = {
  /** At or past this is green. */
  target: number | null;
  /** Between this and the target is yellow. Past it is red. */
  warnAt: number | null;
  direction: Direction;
};

export type Verdict = {
  status: ReviewStatus;
  /** Deterministic, printable, and never written by a model. */
  reason: string;
};

/**
 * Score a reading against its line.
 *
 * `hasReading: false` is red, full stop — see the file header. It is passed
 * explicitly rather than inferred from a null value, because a rule-scored
 * area (a project's health) is a genuine reading that carries no number, and
 * conflating the two would make silence invisible.
 */
export function verdictFor(
  reading: { hasReading: boolean; value: number | null },
  line: Line,
  opts: { unitLabel?: string; notDue?: boolean; notDueReason?: string } = {}
): Verdict {
  if (opts.notDue) {
    return { status: 'not_due', reason: opts.notDueReason ?? 'Not due in this period.' };
  }

  if (!reading.hasReading) {
    return { status: 'red', reason: 'No reading in this period.' };
  }

  if (reading.value === null || !Number.isFinite(reading.value)) {
    // A reading with no number is scored by whoever produced it; reaching here
    // means a collector forgot to supply a status of its own.
    return { status: 'yellow', reason: 'Read, but with no number to score.' };
  }

  const { target, warnAt, direction } = line;
  const shown = formatValue(reading.value, opts.unitLabel);

  // No line means nothing can be past it. Recorded, not judged.
  if (target === null) {
    return { status: 'green', reason: `${shown} recorded. No line set.` };
  }

  const meets = direction === 'higher_better' ? reading.value >= target : reading.value <= target;
  if (meets) {
    return { status: 'green', reason: `${shown} against a line of ${formatValue(target, opts.unitLabel)}.` };
  }

  // The wording follows the direction. "2, short of 0" is what you get from a
  // single phrasing applied to both, and it is nonsense — the reason line is
  // the part a person actually reads, so it has to survive being read.
  const missBy = direction === 'higher_better' ? 'short of' : 'over a line of';
  const pastBy = direction === 'higher_better' ? 'below a floor of' : 'past a line of';

  if (warnAt !== null) {
    const drifting =
      direction === 'higher_better' ? reading.value >= warnAt : reading.value <= warnAt;
    if (drifting) {
      return {
        status: 'yellow',
        reason: `${shown}, ${missBy} ${formatValue(target, opts.unitLabel)}.`,
      };
    }
  }

  return {
    status: 'red',
    reason: `${shown}, ${pastBy} ${formatValue(warnAt ?? target, opts.unitLabel)}.`,
  };
}

/** Numbers print without trailing zeros; a score of 8 is "8", not "8.00". */
export function formatValue(value: number, unitLabel?: string): string {
  const rounded = Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return unitLabel ? `${text} ${unitLabel}` : text;
}

/** How a unit reads next to a number. */
export const UNIT_LABEL: Record<string, string> = {
  score: '/10',
  count: '',
  hours: 'h',
  percent: '%',
  days: 'd',
};

export function unitLabelFor(unit: string): string | undefined {
  const label = UNIT_LABEL[unit];
  return label ? label : undefined;
}

/**
 * The cycle's own color: the worst of its readings.
 *
 * Averaging would let three greens bury a red, which is exactly the arithmetic
 * that lets a quarter go by with one area quietly failing. `not_due` never
 * contributes. A cycle with nothing due at all has no verdict rather than a
 * green one — claiming green for a period nobody measured is the lie this
 * module exists to prevent.
 */
export function overallStatus(statuses: ReviewStatus[]): Exclude<ReviewStatus, 'not_due'> | null {
  const counted = statuses.filter((s) => s !== 'not_due');
  if (counted.length === 0) return null;
  return counted.reduce<Exclude<ReviewStatus, 'not_due'>>(
    (worst, s) => (rankOf(s) > rankOf(worst) ? (s as Exclude<ReviewStatus, 'not_due'>) : worst),
    'green'
  );
}

/**
 * How many consecutive periods an area has now been at this status.
 *
 * One red is an event. The same red three cycles running is a decision being
 * avoided, and it is the only number on the page that cannot be got from
 * looking at this week alone.
 */
export function carryFrom(status: ReviewStatus, prior: { status: ReviewStatus; carried: number } | null): number {
  if (!prior || prior.status !== status) return 1;
  return prior.carried + 1;
}
