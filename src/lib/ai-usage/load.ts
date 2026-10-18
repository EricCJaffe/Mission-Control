/*
 * Reads for the AI usage page and the CSV export. Always through the
 * caller's RLS-scoped server client (schema `mission`), never service role.
 *
 * The tables may not exist yet in an environment (P1's migration applies on
 * merge), so a missing relation is "no data yet", never a crash.
 */

import type { supabaseServer } from '@/lib/supabase/server';
import planConfig from '../../../config/ai-usage-plans.json';
import type { AiPlan, AiUsageSnapshot } from './types.ts';

type Client = Awaited<ReturnType<typeof supabaseServer>>;

export const SNAPSHOT_COLUMNS =
  'id,plan_slug,source,day,host,bot,session_id,project,client,model,messages,tokens_total,' +
  'primary_used_pct,primary_resets_at,secondary_used_pct,secondary_resets_at,' +
  'used_value,limit_value,unit,note,last_at,captured_at';

export type SnapshotRow = Pick<
  AiUsageSnapshot,
  | 'id'
  | 'plan_slug'
  | 'source'
  | 'day'
  | 'host'
  | 'bot'
  | 'session_id'
  | 'project'
  | 'client'
  | 'model'
  | 'messages'
  | 'tokens_total'
  | 'primary_used_pct'
  | 'primary_resets_at'
  | 'secondary_used_pct'
  | 'secondary_resets_at'
  | 'used_value'
  | 'limit_value'
  | 'unit'
  | 'note'
  | 'last_at'
  | 'captured_at'
>;

export type PlanDef = Pick<
  AiPlan,
  'slug' | 'name' | 'limit_kind' | 'limit_value' | 'limit_is_estimate' | 'reset_cadence' | 'reset_anchor'
>;

const PAGE = 1000;
/** A month of per-session, per-day rows is a few thousand; this is a ceiling, not a target. */
const MAX_PAGES = 50;

type PgError = { code?: string; message?: string } | null;

export function isMissingRelation(err: PgError): boolean {
  if (!err) return false;
  return (
    err.code === '42P01' ||
    err.code === 'PGRST205' ||
    /does not exist|schema cache/i.test(err.message ?? '')
  );
}

/** The repo's plan config, used only until the collector has upserted ai_plans. */
export const CONFIG_PLANS: PlanDef[] = (planConfig.plans as Array<Record<string, unknown>>).map((p) => ({
  slug: String(p.slug),
  name: String(p.name),
  limit_kind: p.limit_kind === 'tokens' ? 'tokens' : 'percent',
  limit_value: typeof p.limit_value === 'number' ? p.limit_value : null,
  limit_is_estimate: p.limit_is_estimate !== false,
  reset_cadence: (['5h', 'daily', 'weekly', 'monthly'].includes(String(p.reset_cadence))
    ? p.reset_cadence
    : 'weekly') as AiPlan['reset_cadence'],
  reset_anchor: typeof p.reset_anchor === 'string' ? p.reset_anchor : null,
}));

export type UsageLoad = {
  missing: boolean;
  plans: PlanDef[];
  plansFromConfig: boolean;
  rows: SnapshotRow[];
  truncated: boolean;
  error: string | null;
};

export async function loadUsage(supabase: Client, fromDay: string, toDay: string): Promise<UsageLoad> {
  const planRes = await supabase
    .from('ai_plans')
    .select('slug,name,limit_kind,limit_value,limit_is_estimate,reset_cadence,reset_anchor')
    .eq('active', true)
    .order('slug');

  if (isMissingRelation(planRes.error)) {
    return { missing: true, plans: CONFIG_PLANS, plansFromConfig: true, rows: [], truncated: false, error: null };
  }

  const dbPlans = ((planRes.data ?? []) as PlanDef[]).map((p) => ({
    ...p,
    limit_value: p.limit_value === null ? null : Number(p.limit_value),
  }));
  const plansFromConfig = dbPlans.length === 0;
  const plans = plansFromConfig ? CONFIG_PLANS : dbPlans;

  const rows: SnapshotRow[] = [];
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('ai_usage_snapshots')
      .select(SNAPSHOT_COLUMNS)
      .gte('day', fromDay)
      .lte('day', toDay)
      .order('id')
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      if (isMissingRelation(error)) return { missing: true, plans, plansFromConfig, rows: [], truncated: false, error: null };
      return { missing: false, plans, plansFromConfig, rows, truncated, error: error.message };
    }
    const batch = (data ?? []) as unknown as SnapshotRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    if (page === MAX_PAGES - 1) truncated = true;
  }

  return { missing: false, plans, plansFromConfig, rows, truncated, error: planRes.error?.message ?? null };
}
