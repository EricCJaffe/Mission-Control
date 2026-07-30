/** Minimal shape `carrySetValue` needs — the logger's LoggedSet satisfies it. */
export type CarrySet = {
  id: string;
  reps: number | '';
  weight_lbs: number | '';
  completed: boolean;
};

export type CarryField = 'weight_lbs' | 'reps';

/**
 * Writes a weight/reps value into one set and carries it down to the sets
 * below it, so a straight-across exercise only needs entering once.
 *
 * Rules:
 *  - Sets you've already filled in or completed stop the carry — the first
 *    one that has diverged ends it, and everything past it is left alone.
 *  - Sets we filled keep following the one above until you edit them
 *    yourself. That's what makes live typing work: "1" → "13" → "135" each
 *    propagate, rather than the first keystroke sticking.
 *  - Editing a set by hand makes it authoritative from then on.
 *
 * `carried` is mutated: it tracks `${setId}:${field}` keys we own.
 */
export function carrySetValue<T extends CarrySet>(
  sets: T[],
  setIdx: number,
  field: CarryField,
  value: number | '',
  carried: Set<string>
): T[] {
  const target = sets[setIdx];
  if (!target) return sets;

  const next = [...sets];
  carried.delete(`${target.id}:${field}`);
  next[setIdx] = { ...target, [field]: value };

  for (let i = setIdx + 1; i < next.length; i++) {
    const s = next[i];
    const key = `${s.id}:${field}`;
    const isCarried = carried.has(key);
    if (s.completed || (s[field] !== '' && !isCarried)) break;
    carried.add(key);
    next[i] = { ...s, [field]: value };
  }

  return next;
}
