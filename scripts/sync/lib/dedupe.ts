/*
 * One batch, one row per key.
 *
 * Whatever a parser or a source does, a batch handed to the database must not
 * name the same source_ref twice: tasks_source_ref_idx is unique on
 * (user_id, source, source_ref), and one duplicate used to abort the whole
 * 25-repo run. First occurrence wins (file order); the rest are reported so
 * the caller can log them and carry on.
 */
export function dedupeByRef<T extends { sourceRef: string }>(items: T[]): { unique: T[]; dropped: T[] } {
  const seen = new Set<string>();
  const unique: T[] = [];
  const dropped: T[] = [];
  for (const item of items) {
    if (seen.has(item.sourceRef)) dropped.push(item);
    else {
      seen.add(item.sourceRef);
      unique.push(item);
    }
  }
  return { unique, dropped };
}

/** Postgres unique_violation. */
export function isUniqueViolation(err: { code?: string | null; message?: string } | null | undefined): boolean {
  return !!err && (err.code === '23505' || /duplicate key value/.test(err.message ?? ''));
}
