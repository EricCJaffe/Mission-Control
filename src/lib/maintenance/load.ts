/** Reads for the /maintenance pages and the calendar. */

import type { MissionClient } from '@/lib/supabase/schema';
import { verdictFor, type Verdict } from './status';
import type { Category } from './library';

export type AssetRow = {
  id: string;
  name: string;
  category: Category;
  make: string | null;
  model: string | null;
  model_year: number | null;
  serial_number: string | null;
  location: string | null;
  meter_unit: 'hours' | 'miles' | null;
  meter_reading: number | null;
  meter_read_at: string | null;
  purchased_on: string | null;
  parts_notes: string | null;
  notes: string | null;
  finance_asset_id: string | null;
  status: 'active' | 'stored' | 'retired';
  research: unknown;
  researched_at: string | null;
};

export const ASSET_COLUMNS =
  'id,name,category,make,model,model_year,serial_number,location,meter_unit,meter_reading,meter_read_at,purchased_on,parts_notes,notes,finance_asset_id,status,research,researched_at';

export type PlanRow = {
  task_id: string;
  asset_id: string;
  library_key: string | null;
  meter_interval: number | null;
  last_meter: number | null;
  task: {
    id: string;
    title: string;
    description: string | null;
    why: string | null;
    due_date: string | null;
    recurrence_rule: string | null;
    recurrence_anchor: string | null;
    status: string | null;
    last_completed_at: string | null;
  };
  verdict: Verdict;
  days: number | null;
  meterUsed: number | null;
};

/** Every open schedule, with its verdict, for the given assets (or all). */
export async function loadPlans(
  db: MissionClient,
  assets: Array<Pick<AssetRow, 'id' | 'meter_reading'>>,
  todayIso: string,
): Promise<PlanRow[]> {
  if (assets.length === 0) return [];
  const { data } = await db
    .from('maintenance_plans')
    .select(
      'task_id,asset_id,library_key,meter_interval,last_meter,task:tasks(id,title,description,why,due_date,recurrence_rule,recurrence_anchor,status,last_completed_at)',
    )
    .in('asset_id', assets.map((a) => a.id));

  const meterOf = new Map(assets.map((a) => [a.id, a.meter_reading]));
  const rows: PlanRow[] = [];
  for (const raw of (data ?? []) as unknown as Array<Omit<PlanRow, 'verdict' | 'days' | 'meterUsed'>>) {
    // A closed one-off is history, not a schedule.
    if (!raw.task || raw.task.status === 'done') continue;
    const v = verdictFor(raw.task.due_date, todayIso, {
      reading: meterOf.get(raw.asset_id) ?? null,
      last: raw.last_meter,
      interval: raw.meter_interval,
    });
    rows.push({ ...raw, ...v });
  }
  return rows.sort((a, b) => (a.task.due_date ?? '9999').localeCompare(b.task.due_date ?? '9999'));
}

const RANK: Record<Verdict, number> = { red: 0, yellow: 1, green: 2 };

export function worst(verdicts: Verdict[]): Verdict {
  return verdicts.reduce<Verdict>((w, v) => (RANK[v] < RANK[w] ? v : w), 'green');
}

/*
 * Red / yellow / green — the framework's vocabulary, and Tailwind's yellow
 * palette to match it.
 */
export const VERDICT_CLASS: Record<Verdict, string> = {
  red: 'bg-red-50 text-red-700 border-red-200',
  yellow: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  green: 'bg-green-50 text-green-700 border-green-200',
};

export const VERDICT_DOT: Record<Verdict, string> = {
  red: 'bg-red-500',
  yellow: 'bg-yellow-400',
  green: 'bg-green-500',
};
