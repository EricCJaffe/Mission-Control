import { createClient } from '@supabase/supabase-js';
import { DB_SCHEMA } from '@/lib/supabase/schema';
import type { Deps } from './handlers.ts';

/**
 * Real dependencies for the Muse routes. Service role, because neither Muse
 * nor the brain-side pull has a session and RLS would return nothing, which
 * looks like "empty". Every query is scoped to MC_USER_ID in mail.ts.
 */
export function museDeps(): Deps {
  return {
    env: process.env,
    db: () =>
      createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
        db: { schema: DB_SCHEMA },
        auth: { persistSession: false, autoRefreshToken: false },
      }),
  };
}
