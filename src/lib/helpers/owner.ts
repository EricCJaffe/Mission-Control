/**
 * Owner-side helpers for /helpers: who is signed in, the property list for
 * locations, and the project new one-off jobs are filed under.
 */

import { supabaseServer } from '@/lib/supabase/server';
import type { MissionClient } from '@/lib/supabase/schema';

export async function owner(): Promise<{ db: MissionClient; userId: string } | null> {
  const db = await supabaseServer();
  const { data } = await db.auth.getUser();
  return data.user ? { db, userId: data.user.id } : null;
}

export type Property = { id: string; label: string; kind: string | null };

/*
 * Locations come from FinanceOS's real-estate assets, read as Eric under RLS,
 * so a property added there appears here on its own. The label stored on a
 * job is a snapshot: a helper never reads the assets table.
 */
export async function properties(db: MissionClient): Promise<Property[]> {
  const { data } = await db.schema('public').from('assets').select('id,name,location,rental_type').eq('asset_type', 'real_estate').order('name');
  const rows = (data ?? []) as Array<{ id: string; name: string; location: string | null; rental_type: string | null }>;
  // The house first, then the rest by address.
  return rows
    .map((r) => ({ id: r.id, label: r.location || r.name, kind: r.rental_type }))
    .sort((a, b) => Number(b.kind === 'owner_occupied') - Number(a.kind === 'owner_occupied') || a.label.localeCompare(b.label));
}

export const JOBS_PROJECT = { slug: 'helper-jobs', title: 'Home & Property Jobs', domain: 'family' } as const;

/** The project one-off helper jobs live in, created on first use. */
export async function jobsProjectId(db: MissionClient, userId: string): Promise<string> {
  const { data } = await db.from('projects').select('id').eq('user_id', userId).eq('slug', JOBS_PROJECT.slug).maybeSingle();
  if (data) return data.id as string;
  const { data: created, error } = await db
    .from('projects')
    .insert({
      user_id: userId,
      title: JOBS_PROJECT.title,
      slug: JOBS_PROJECT.slug,
      domain: JOBS_PROJECT.domain,
      description: 'One-off jobs around the house and the rentals, shared with helpers from /helpers.',
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(error?.message ?? 'Could not create the jobs project');
  return created.id as string;
}
