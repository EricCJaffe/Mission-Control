/*
 * The Supabase client the sync writes through.
 *
 * Service role, because a cron job has no signed-in user and the harvester
 * must write rows owned by MC_USER_ID. That bypasses RLS, so every insert here
 * sets user_id explicitly — there is no policy left to catch the omission.
 *
 * `db: { schema: DB_SCHEMA }` is not optional. Without it the client talks to
 * `public`, which in this database is FinanceOS, and both schemas have `tasks`
 * and `projects` — so the write would succeed against the wrong app.
 */

import { createClient } from '@supabase/supabase-js';
import type { SyncEnv } from './env.ts';

/** Kept in step with src/lib/supabase/schema.ts, which the app reads. */
export const DB_SCHEMA = 'mission' as const;

export function createSyncClient(env: SyncEnv) {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SyncClient = ReturnType<typeof createSyncClient>;
