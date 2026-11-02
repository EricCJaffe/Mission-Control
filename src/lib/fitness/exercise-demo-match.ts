/**
 * Match a Mission Control exercise name to one row of the exercises dataset.
 *
 * Scoring is token overlap with equipment hints and a hard penalty when the
 * candidate adds a modifier the query did not (incline, assisted, one-arm,
 * seated, and the like). A match is kept only when it clears MATCH_MIN_SCORE
 * and leads the runner-up by MATCH_MIN_MARGIN, unless the runner-up is the
 * same words with a different camera angle.
 *
 * The 1,324-row dataset is not imported here. The match script reads it and
 * writes the small catalog the app ships.
 */

export const MATCH_MIN_SCORE = 78;
export const MATCH_MIN_MARGIN = 6;

const NOISE = new Set([
  'v', 'version', 'male', 'female', 'pov', 'with', 'the', 'a', 'an', 'on', 'of',
  'and', 'to', 'for', 'in', 'from', 'degrees', 'degree', 'range', 'motion',
]);

const SYNONYM: Record<string, string> = {
  bicep: 'biceps',
  biceps: 'biceps',
  tricep: 'triceps',
  triceps: 'triceps',
  pushdowns: 'pushdown',
  pushdown: 'pushdown',
  pulldowns: 'pulldown',
  pulldown: 'pulldown',
  pullup: 'pull-up',
  pullups: 'pull-up',
  'pull-ups': 'pull-up',
  chinup: 'chin-up',
  chinups: 'chin-up',
  flye: 'fly',
  flyes: 'fly',
  flies: 'fly',
  shrugs: 'shrug',
  dumbbells: 'dumbbell',
  db: 'dumbbell',
  bb: 'barbell',
  bodyweight: 'bodyweight',
  bw: 'bodyweight',
  machines: 'machine',
  machine: 'machine',
  leverage: 'machine',
  lever: 'machine',
  sled: 'machine',
  cables: 'cable',
  cable: 'cable',
  bands: 'band',
  kb: 'kettlebell',
  'ez-bar': 'ez',
  ezbar: 'ez',
};

const EQUIPMENT = new Set([
  'dumbbell', 'barbell', 'cable', 'machine', 'band', 'bodyweight',
  'kettlebell', 'smith', 'ez', 'trap-bar',
]);

/** A tool the query did not name. "Machine" is generic; these are not. */
const SPECIFIC_EQUIPMENT = [
  'smith', 'ez', 'band', 'kettlebell', 'cable', 'dumbbell', 'barbell', 'trap-bar', 'bodyweight',
] as const;

const ANGLE = ['incline', 'decline', 'flat'] as const;
const GRIP = ['reverse', 'underhand', 'overhand', 'neutral', 'close', 'wide', 'narrow', 'hammer'] as const;
const ASSIST = ['assisted', 'weighted'] as const;
const LATERALITY = ['one', 'single', 'alternate', 'alternating', 'unilateral'] as const;
const POSITION = ['seated', 'standing', 'lying', 'kneeling'] as const;
const FAMILIES = [ANGLE, GRIP, ASSIST, LATERALITY, POSITION] as const;

const EXTRA_MODIFIERS = new Set([
  'oblique', 'front', 'lateral', 'rear', 'overhead', 'romanian', 'sumo',
  'pike', 'twist', 'twisting', 'twisted', 'preacher', 'upright',
]);

const OPTIONAL_QUERY = new Set(['flat']);

export type DatasetExerciseRef = {
  id: string;
  name: string;
  equipment: string;
};

export type ScoredMatch<T extends DatasetExerciseRef = DatasetExerciseRef> = {
  exercise: T;
  score: number;
};

export function tokenizeExerciseName(name: string): string[] {
  const cleaned = name
    .toLowerCase()
    .replace(/\u0432/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/[()[\]/+,.]/g, ' ')
    .replace(/[^a-z0-9+ ]+/g, ' ');

  const raw = cleaned.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const token = raw[i]!;
    const next = raw[i + 1];
    if (token === 'trap' && next === 'bar') { out.push('trap-bar'); i++; continue; }
    if (token === 'pull' && (next === 'up' || next === 'ups')) { out.push('pull-up'); i++; continue; }
    if (token === 'chin' && (next === 'up' || next === 'ups')) { out.push('chin-up'); i++; continue; }
    if (token === 'push' && (next === 'down' || next === 'downs')) { out.push('pushdown'); i++; continue; }
    if (token === 'body' && next === 'weight') { out.push('bodyweight'); i++; continue; }
    if ((token === 'side' || token === 'back') && next === 'pov') { i++; continue; }
    if (token === 'bent' && next === 'over') { i++; continue; }
    if (token === 'full' && next === 'range') continue;
    if (NOISE.has(token) || /^\d+$/.test(token)) continue;
    const mapped = SYNONYM[token] ?? token;
    if (NOISE.has(mapped)) continue;
    out.push(mapped);
  }
  return out;
}

function requiredContent(tokens: string[]): string[] {
  const set = new Set(tokens.filter((token) => !EQUIPMENT.has(token) && !OPTIONAL_QUERY.has(token)));
  // "Pushdown" is the triceps movement. Candidates often omit the muscle word.
  if (set.has('pushdown')) set.delete('triceps');
  return [...set];
}

function familyConflict(query: Set<string>, candidate: Set<string>, family: readonly string[]): boolean {
  const queryHas = family.filter((token) => query.has(token));
  const candidateHas = family.filter((token) => candidate.has(token));
  if (candidateHas.length === 0) return false;
  if (queryHas.length === 0) return true;
  return queryHas.some((token) => !candidateHas.includes(token))
    || candidateHas.some((token) => !queryHas.includes(token));
}

export function scoreExerciseMatch(
  queryName: string,
  queryEquipment: string | null,
  candidate: DatasetExerciseRef,
): number {
  const queryTokens = tokenizeExerciseName(`${queryName} ${queryEquipment ?? ''}`);
  const candidateTokens = tokenizeExerciseName(`${candidate.name} ${candidate.equipment}`);
  const query = new Set(queryTokens);
  const candidateSet = new Set(candidateTokens);
  const required = requiredContent(queryTokens);
  if (required.length === 0) return 0;

  const covered = required.filter((token) => candidateSet.has(token)).length;
  const coverage = covered / required.length;
  const candidateContent = [...new Set(candidateTokens.filter((token) => !EQUIPMENT.has(token)))];
  const extras = candidateContent.filter((token) => !query.has(token));

  let score = Math.round(coverage * 70);

  const queryEquipmentTokens = new Set(queryTokens.filter((token) => EQUIPMENT.has(token)));
  const candidateEquipment = new Set(candidateTokens.filter((token) => EQUIPMENT.has(token)));
  if (queryEquipmentTokens.size === 0) score += 8;
  else if ([...queryEquipmentTokens].every((token) => candidateEquipment.has(token))) score += 15;
  else score -= 20;

  for (const specific of SPECIFIC_EQUIPMENT) {
    if (candidateEquipment.has(specific) && !queryEquipmentTokens.has(specific)) score -= 18;
  }

  score -= extras.length * 6;

  for (const family of FAMILIES) {
    if (familyConflict(query, candidateSet, family)) score -= 28;
  }
  for (const extra of extras) {
    if (EXTRA_MODIFIERS.has(extra)) score -= 10;
  }

  if (coverage === 1 && extras.length === 0 && [...queryEquipmentTokens].every((token) => candidateEquipment.has(token))) {
    score += 8;
  }

  return Math.max(0, Math.min(100, score));
}

export function rankExerciseMatches<T extends DatasetExerciseRef>(
  queryName: string,
  queryEquipment: string | null,
  dataset: readonly T[],
): ScoredMatch<T>[] {
  return dataset
    .map((exercise) => ({
      exercise,
      score: scoreExerciseMatch(queryName, queryEquipment, exercise),
    }))
    .sort((a, b) => b.score - a.score
      || a.exercise.name.length - b.exercise.name.length
      || a.exercise.id.localeCompare(b.exercise.id));
}

function tokenSignature(exercise: DatasetExerciseRef): string {
  return tokenizeExerciseName(`${exercise.name} ${exercise.equipment}`).slice().sort().join(' ');
}

/** The top match when it is confident. Null when nothing qualifies or the top two disagree. */
export function acceptExerciseMatch<T extends DatasetExerciseRef>(
  ranked: readonly ScoredMatch<T>[],
): ScoredMatch<T> | null {
  const best = ranked[0];
  if (!best || best.score < MATCH_MIN_SCORE) return null;
  const second = ranked[1];
  if (second && best.score - second.score < MATCH_MIN_MARGIN) {
    if (tokenSignature(best.exercise) !== tokenSignature(second.exercise)) return null;
  }
  return best;
}

export type RoutineMatch<T extends DatasetExerciseRef> =
  | {
      kind: 'matched';
      via: 'fuzzy' | 'override';
      exercise: T;
      score: number;
    }
  | {
      kind: 'unmatched';
      reason: string;
      closest: ScoredMatch<T> | null;
    };

export function resolveRoutineExercise<T extends DatasetExerciseRef>(
  name: string,
  equipment: string | null,
  dataset: readonly T[],
  overrides: Readonly<Record<string, string | null>>,
): RoutineMatch<T> {
  const ranked = rankExerciseMatches(name, equipment, dataset);
  const closest = ranked[0] && ranked[0].score > 0 ? ranked[0] : null;

  if (Object.prototype.hasOwnProperty.call(overrides, name)) {
    const overrideId = overrides[name];
    if (overrideId === null) {
      return {
        kind: 'unmatched',
        reason: 'Manual override: no dataset clip is this movement.',
        closest,
      };
    }
    const exercise = dataset.find((row) => row.id === overrideId);
    if (!exercise) {
      return {
        kind: 'unmatched',
        reason: `Manual override id ${overrideId} is not in the dataset.`,
        closest,
      };
    }
    const score = ranked.find((row) => row.exercise.id === overrideId)?.score ?? 0;
    return { kind: 'matched', via: 'override', exercise, score };
  }

  const fuzzy = acceptExerciseMatch(ranked);
  if (!fuzzy) {
    const ambiguous = closest != null && closest.score >= MATCH_MIN_SCORE;
    return {
      kind: 'unmatched',
      reason: ambiguous
        ? 'Ambiguous: the top dataset names are too close to pick one.'
        : 'No dataset exercise cleared the confidence line.',
      closest,
    };
  }
  return { kind: 'matched', via: 'fuzzy', exercise: fuzzy.exercise, score: fuzzy.score };
}

/** The dataset spells one sled name with a Cyrillic letter in front of the degree sign. */
export function displayDatasetName(name: string): string {
  return name.replace(/\u0432\u00b0/g, '°');
}
