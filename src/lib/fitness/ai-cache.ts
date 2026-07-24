// ============================================================
// AI OUTPUT CACHE
//
// Thin wrapper over the ai_output_cache table. Exists so AI routes can follow
// one rule: a GET never spends tokens, a POST does.
//
// Several routes previously called OpenAI directly from a GET that a component
// fired in a useEffect, so merely opening a page billed a request and
// regenerated text that had not changed. Reading is free and explicit
// regeneration is a POST.
//
// Access control is RLS on the table (auth.uid() = user_id), enforced because
// callers pass the user-scoped Supabase client. `userId` is used only to fill
// the column on write — it is NOT the security boundary, so a caller cannot
// read another user's cache by passing a different uuid.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type CacheKey = 'morning_briefing' | 'metrics_analytics';

export type CachedOutput<T> = {
  found: boolean;
  payload: T | null;
  generated_at: string | null;
};

/**
 * Read the last generated payload for this user/key. Never calls OpenAI.
 * Returns found:false rather than throwing when nothing has been generated yet.
 */
export async function readAiCache<T>(
  supabase: SupabaseClient,
  userId: string,
  key: CacheKey
): Promise<CachedOutput<T>> {
  const { data, error } = await supabase
    .from('ai_output_cache')
    .select('payload, generated_at')
    .eq('user_id', userId)
    .eq('cache_key', key)
    .maybeSingle();

  if (error) {
    console.error(`[ai-cache] read failed for ${key}:`, error.message);
    return { found: false, payload: null, generated_at: null };
  }
  if (!data) {
    return { found: false, payload: null, generated_at: null };
  }

  return {
    found: true,
    payload: data.payload as T,
    generated_at: data.generated_at as string,
  };
}

/**
 * Persist a freshly generated payload.
 *
 * A cache-write failure must not discard output the user already paid for, so
 * this logs and returns null rather than throwing — callers return the fresh
 * result either way.
 */
export async function writeAiCache<T>(
  supabase: SupabaseClient,
  userId: string,
  key: CacheKey,
  payload: T
): Promise<string | null> {
  const generatedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('ai_output_cache')
    .upsert(
      {
        user_id: userId,
        cache_key: key,
        payload,
        generated_at: generatedAt,
        updated_at: generatedAt,
      },
      { onConflict: 'user_id,cache_key' }
    )
    .select('generated_at')
    .maybeSingle();

  if (error) {
    console.error(`[ai-cache] write failed for ${key}:`, error.message);
    return null;
  }

  return (data?.generated_at as string) ?? generatedAt;
}
