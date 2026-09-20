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

export const REVIEW_STATUSES = ['green', 'yellow', 'red', 'unknown', 'not_due'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function isReviewStatus(value: unknown): value is ReviewStatus {
  return typeof value === 'string' && (REVIEW_STATUSES as readonly string[]).includes(value);
}

/** Worst-first. `rankOf` is what "the worst color wins" is implemented with. */
const RANK: Record<ReviewStatus, number> = { red: 3, yellow: 2, green: 1, unknown: 0, not_due: 0 };

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
  unknown: {
    status: 'unknown',
    label: 'No line',
    meaning: 'Nobody has set a target, so there is nothing to judge against. Set one.',
    border: 'border-slate-400',
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    solid: 'bg-slate-500 text-white',
    hex: '#64748b',
    glyph: '?',
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

/**
 * The same three directions honeylakeos uses. `within_range` exists because
 * both too high and too low are failures for weight, sleep hours and blood
 * pressure — all of which Mission Control already stores — and there was no
 * way to say that with two thresholds and a comparison operator.
 */
export type Direction = 'higher_is_better' | 'lower_is_better' | 'within_range';

export type Line = {
  /** At or past this is green. Compared with <= when lower_is_better. */
  greenAt: number | null;
  /** Between this and greenAt is yellow; past it is red. */
  yellowAt: number | null;
  /** The center, for `within_range` only. The thresholds become tolerances. */
  targetValue?: number | null;
  direction: Direction;
};

function finiteOrNull(n: number | null | undefined): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/**
 * Has anyone actually drawn a line for this area?
 *
 * Ported from `measureHasTarget` in honeylakeos, and exported for the same
 * reason it is exported there: more than one screen has to say "no line set"
 * out loud, and a second copy of the rule in a component is how the legend and
 * the tiles come to disagree.
 *
 * ⚠️ It reads exactly the columns `verdictFor` reads, in the same order, so an
 * area this returns false for is precisely an area that reads `unknown`.
 */
export function hasLine(line: Line | null | undefined): boolean {
  if (!line) return false;

  const green = finiteOrNull(line.greenAt);
  const yellow = finiteOrNull(line.yellowAt);
  const direction = line.direction ?? 'higher_is_better';

  if (direction === 'within_range') {
    // A center and at least one tolerance. Without the center there is nothing
    // to be within; without a tolerance there is no band.
    if (finiteOrNull(line.targetValue) === null) return false;
    return green !== null || yellow !== null;
  }

  // An unrecognized direction is a configuration problem too: the thresholds
  // may be there but nothing knows which way to read them.
  if (direction !== 'higher_is_better' && direction !== 'lower_is_better') return false;

  return green !== null || yellow !== null;
}

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

  // Configuration before reading, and the order is the design. honeylakeos:
  // "Red accuses the number; this accuses the setup." An area nobody has drawn
  // a line for cannot be past it, and reporting that as green — which this
  // module did until 2026-09-20 — is an unconfigured measure claiming all is
  // well, which is worse than one claiming nothing.
  if (!hasLine(line)) {
    return { status: 'unknown', reason: 'No line set for this area yet.' };
  }

  // A line exists and nothing was reported. Eric, 2026-09-20: "No reading would
  // be red" — the same amendment he made to honeylakeos's ADR 0016 three days
  // earlier. Null, NaN and Infinity all land here: an unreadable reading is
  // still no reading.
  if (!reading.hasReading) {
    return { status: 'red', reason: 'No reading in this period.' };
  }

  const value = finiteOrNull(reading.value);
  if (value === null) {
    return { status: 'red', reason: 'No usable reading in this period.' };
  }

  const green = finiteOrNull(line.greenAt);
  const yellow = finiteOrNull(line.yellowAt);
  const direction = line.direction ?? 'higher_is_better';
  const shown = formatValue(value, opts.unitLabel);

  if (direction === 'within_range') {
    // `hasLine` has already proved the center and one tolerance exist. The
    // tolerances are sign-insensitive and the tighter one is the green band,
    // whichever field it was typed into — a target of 7 hours' sleep with
    // tolerances of 1 and 2 is the same band however they are entered.
    const center = finiteOrNull(line.targetValue)!;
    const a = green === null ? null : Math.abs(green);
    const b = yellow === null ? null : Math.abs(yellow);
    const tight = a === null ? b! : b === null ? a : Math.min(a, b);
    const wide = a === null ? b! : b === null ? a : Math.max(a, b);
    const distance = Math.abs(value - center);

    if (distance <= tight) {
      return { status: 'green', reason: `${shown}, within ${formatValue(tight)} of ${formatValue(center, opts.unitLabel)}.` };
    }
    if (distance <= wide) {
      return { status: 'yellow', reason: `${shown}, drifting from ${formatValue(center, opts.unitLabel)}.` };
    }
    return { status: 'red', reason: `${shown}, outside the band around ${formatValue(center, opts.unitLabel)}.` };
  }

  /*
   * `hasLine` has already proved at least one threshold is a finite number, so
   * every `a ?? b` below has a value. TypeScript cannot see that across the
   * function boundary, and a non-null assertion would hide a real bug if the
   * two ever drifted apart — so the fallback is explicit and prints the line
   * that exists.
   */
  const lineOf = (first: number | null, second: number | null): string =>
    formatValue((first ?? second) as number, opts.unitLabel);

  if (direction === 'lower_is_better') {
    // The inversion. Small is good, so the comparison flips to <=.
    if (green !== null && value <= green) {
      return { status: 'green', reason: `${shown} against a line of ${formatValue(green, opts.unitLabel)}.` };
    }
    if (yellow !== null && value <= yellow) {
      return { status: 'yellow', reason: `${shown}, over a line of ${lineOf(green, yellow)}.` };
    }
    return { status: 'red', reason: `${shown}, past a line of ${lineOf(yellow, green)}.` };
  }

  // higher_is_better — the only direction left, `hasLine` having refused any
  // other. The wording follows the direction: a single phrasing applied to
  // both produces "2, short of 0", which is nonsense, and the reason line is
  // the part a person actually reads.
  if (green !== null && value >= green) {
    return { status: 'green', reason: `${shown} against a line of ${formatValue(green, opts.unitLabel)}.` };
  }
  if (yellow !== null && value >= yellow) {
    return { status: 'yellow', reason: `${shown}, short of ${lineOf(green, yellow)}.` };
  }
  return { status: 'red', reason: `${shown}, below a floor of ${lineOf(yellow, green)}.` };
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
export type OverallStatus = 'red' | 'yellow' | 'green';

export function overallStatus(statuses: ReviewStatus[]): OverallStatus | null {
  // `unknown` is excluded alongside `not_due`: an area with no line drawn is a
  // setup problem, and letting it pull the week's color either way would make
  // the verdict a statement about the configuration rather than the period.
  // It is surfaced separately — see `unconfiguredCount`.
  const counted = statuses.filter((s) => s !== 'not_due' && s !== 'unknown');
  if (counted.length === 0) return null;
  return counted.reduce<OverallStatus>(
    (worst, s) => (rankOf(s) > rankOf(worst) ? (s as OverallStatus) : worst),
    'green'
  );
}

/** Areas with no line drawn. Worth its own number, because it is fixable. */
export function unconfiguredCount(statuses: ReviewStatus[]): number {
  return statuses.filter((s) => s === 'unknown').length;
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
