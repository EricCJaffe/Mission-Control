/*
 * AI usage meter: the row shapes shared by the collector (scripts/usage, P1)
 * and the page (src/app/ai-usage, P2). Mirrors
 * supabase/migrations/20261018163500_ai_usage.sql. Change both together.
 */

export type PlanSlug = 'claude-max' | 'chatgpt-codex' | 'grok-ultra' | (string & {});

export type AiPlan = {
  id: string;
  user_id: string;
  slug: PlanSlug;
  name: string;
  vendor: string;
  price_usd_month: number | null;
  limit_kind: 'tokens' | 'percent';
  limit_value: number | null;
  limit_is_estimate: boolean;
  reset_cadence: '5h' | 'daily' | 'weekly' | 'monthly';
  reset_anchor: string | null;
  active: boolean;
  notes: string | null;
};

export type AiUsageSnapshot = {
  id: number;
  user_id: string;
  plan_slug: PlanSlug;
  source: 'log' | 'manual';
  /** America/New_York usage day, YYYY-MM-DD. */
  day: string;
  host: string;
  bot: string;
  session_id: string;
  /** 'unattributed' when the working directory could not be mapped. */
  project: string;
  client: string | null;
  model: string | null;
  messages: number;
  tokens_in: number;
  tokens_out: number;
  tokens_cache_read: number;
  tokens_cache_write: number;
  tokens_total: number;
  primary_used_pct: number | null;
  primary_window_minutes: number | null;
  primary_resets_at: string | null;
  secondary_used_pct: number | null;
  secondary_window_minutes: number | null;
  secondary_resets_at: string | null;
  used_value: number | null;
  limit_value: number | null;
  unit: string | null;
  note: string | null;
  first_at: string | null;
  last_at: string | null;
  captured_at: string;
};

export type AiUsageDaily = {
  user_id: string;
  plan_slug: PlanSlug;
  day: string;
  tokens_total: number;
  messages: number;
  sessions: number;
  primary_used_pct: number | null;
  secondary_used_pct: number | null;
  captured_at: string;
};

export const UNATTRIBUTED = 'unattributed' as const;
