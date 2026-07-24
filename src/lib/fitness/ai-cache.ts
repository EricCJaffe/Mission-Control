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
  const { data, error } = await supabase.rpc('get_ai_output_cache', {
    p_user_id: userId,
    p_cache_key: key,
  });

  if (error || !data?.found) {
    if (error) console.error(`[ai-cache] read failed for ${key}:`, error.message);
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
  const { data, error } = await supabase.rpc('upsert_ai_output_cache', {
    p_user_id: userId,
    p_cache_key: key,
    p_payload: payload,
  });

  if (error) {
    console.error(`[ai-cache] write failed for ${key}:`, error.message);
    return null;
  }

  return (data as string) ?? null;
}
