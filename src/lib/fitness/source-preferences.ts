import type { SupabaseClient } from '@supabase/supabase-js';

export type SourcePreferences = {
  sleep_source: string;
  daily_summary_source: string;
  body_metrics_source: string;
  resting_hr_source: string;
  hrv_source: string;
};

const DEFAULTS: SourcePreferences = {
  sleep_source: 'any',
  daily_summary_source: 'any',
  body_metrics_source: 'any',
  resting_hr_source: 'any',
  hrv_source: 'any',
};

export async function loadSourcePreferences(
  supabase: SupabaseClient,
  userId: string
): Promise<SourcePreferences> {
  const { data } = await supabase
    .from('health_source_preferences')
    .select('sleep_source, daily_summary_source, body_metrics_source, resting_hr_source, hrv_source')
    .eq('user_id', userId)
    .maybeSingle();

  return data ?? { ...DEFAULTS };
}

/**
 * Returns true if the given source is allowed for the given category.
 * 'any' means all sources are accepted.
 */
export function isSourceAllowed(preference: string, source: string): boolean {
  if (preference === 'any') return true;
  return preference === source;
}
