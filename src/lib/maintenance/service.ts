/**
 * The maintenance module's writes, in one place, so the routes stay thin and
 * every path that creates a schedule creates it the same way.
 *
 * A schedule is a task (see the migration header,
 * 20260924175217_maintenance_module.sql): it lives in `mission.tasks` under the
 * one maintenance project, with a `maintenance_plans` row saying which machine
 * it is for. That is what makes it show up in /tasks, the brief, the dashboard
 * and the calendar without any of them knowing this module exists.
 */

import type { MissionClient } from '@/lib/supabase/schema';
import { today } from '@/lib/day';
import { parseRRule } from '@/lib/tasks/recurrence';
import { CATEGORIES, firstDue, itemsFor, type Category, type LibraryItem } from './library';

export const PROJECT_SLUG = 'home-maintenance';
const PROJECT_TITLE = 'Home & Equipment Maintenance';

/*
 * Stewardship of the house and what is in it sits under Family in the
 * priority matrix. Impact is Foundation Stone's work, and none of this is.
 */
export const MAINTENANCE_DOMAIN = 'family';

/** The one project every maintenance task files under. Created on first use. */
export async function ensureProject(db: MissionClient, userId: string): Promise<string> {
  const { data: existing } = await db
    .from('projects')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', PROJECT_SLUG)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await db
    .from('projects')
    .insert({
      user_id: userId,
      title: PROJECT_TITLE,
      slug: PROJECT_SLUG,
      description: 'Recurring upkeep for equipment, vehicles, home systems and appliances. Managed from /maintenance.',
      status: 'active',
      domain: MAINTENANCE_DOMAIN,
      // Not a repo. The harvester must never try to read one for it.
      sync_enabled: false,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create the maintenance project');
  return data.id as string;
}

export type NewSchedule = {
  title: string;
  rule: string;
  instructions?: string | null;
  why?: string | null;
  anchor?: string;
  /* Explicit first due date; wins over the anchor/stagger calculation. */
  due?: string | null;
  meterInterval?: number | null;
  libraryKey?: string | null;
  stagger?: number;
};

/** Creates one schedule: the task, then the plan row that ties it to the asset. */
export async function addSchedule(
  db: MissionClient,
  userId: string,
  asset: { id: string; name: string },
  projectId: string,
  s: NewSchedule,
): Promise<void> {
  // A rule the parser cannot read would create a task that never rolls
  // forward, which looks fine until the second time it is due.
  if (!parseRRule(s.rule)) throw new Error(`Unreadable repeat rule: ${s.rule}`);

  const start = firstDue(s.rule, today(), { anchor: s.anchor, stagger: s.stagger });
  const due = s.due || start.due;

  const { data: task, error } = await db
    .from('tasks')
    .insert({
      user_id: userId,
      project_id: projectId,
      title: `${asset.name}: ${s.title}`,
      description: s.instructions ?? null,
      why: s.why ?? null,
      status: 'todo',
      priority: 3,
      due_date: due,
      recurrence_rule: s.rule,
      recurrence_anchor: s.due ? s.due : start.anchor,
      domain: MAINTENANCE_DOMAIN,
      category: 'maintenance',
      source: 'manual',
    })
    .select('id')
    .single();
  if (error || !task) throw new Error(error?.message ?? 'Could not create the task');

  const { error: planError } = await db.from('maintenance_plans').insert({
    task_id: task.id,
    asset_id: asset.id,
    user_id: userId,
    library_key: s.libraryKey ?? null,
    meter_interval: s.meterInterval ?? null,
  });
  if (planError) {
    // Do not leave a maintenance task that the maintenance screen cannot see.
    await db.from('tasks').delete().eq('id', task.id);
    throw new Error(planError.message);
  }
}

export function scheduleFromLibrary(item: LibraryItem, stagger = 0): NewSchedule {
  return {
    title: item.title,
    rule: item.rule,
    instructions: item.instructions,
    why: item.why,
    anchor: item.anchor,
    meterInterval: item.meterInterval ?? null,
    libraryKey: item.key,
    stagger,
  };
}

/** Adds an asset and schedules its library defaults. Returns the new id. */
export async function createAsset(
  db: MissionClient,
  userId: string,
  input: { name: string; category: Category } & Record<string, unknown>,
  opts: { seedSchedules?: boolean; staggerStart?: number } = {},
): Promise<string> {
  const { data: asset, error } = await db
    .from('maintenance_assets')
    .insert({
      ...input,
      user_id: userId,
      meter_unit: input.meter_unit ?? CATEGORIES[input.category].meterUnit,
    })
    .select('id,name')
    .single();
  if (error || !asset) throw new Error(error?.message ?? 'Could not add the item');

  if (opts.seedSchedules !== false) {
    const projectId = await ensureProject(db, userId);
    const items = itemsFor(input.category).filter((i) => i.seed);
    let stagger = opts.staggerStart ?? 0;
    for (const item of items) {
      await addSchedule(db, userId, asset as { id: string; name: string }, projectId, scheduleFromLibrary(item, stagger % 28));
      stagger += 3;
    }
  }
  return asset.id as string;
}
