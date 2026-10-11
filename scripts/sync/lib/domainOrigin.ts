import type { SyncClient } from './db.ts';

/** PostgREST says PGRST204; Postgres says 42703. Either means the column is not there yet. */
export function missingDomainOrigin(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return error.code === '42703' || error.code === 'PGRST204' || /domain_origin/i.test(error.message ?? '');
}

export async function domainOriginColumn(db: SyncClient): Promise<boolean> {
  const { error } = await db.from('calendar_events').select('domain_origin').limit(1);
  if (!error) return true;
  if (missingDomainOrigin(error)) return false;
  throw new Error(`Could not read calendar domain origin: ${error.message}`);
}
