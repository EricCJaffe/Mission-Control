/**
 * Tick a practice for a day because something else proved it happened.
 *
 * Reading a plan day IS the Bible-reading practice, and praying through a
 * request IS the prayer practice. Eric, 2026-09-29: "if u read Bible passages
 * or click on prayers it should update the count." Faith reading is left to a
 * manual tick, because it is usually a physical book and nothing in the app
 * sees it.
 *
 * Best effort: the reading or the prayer is the record that matters, so a
 * failed tick never fails the request that caused it. Upserts on the same key
 * as the manual toggle, so a tap and an automatic tick never double-count.
 */

import type { MissionClient } from '@/lib/supabase/schema';

export async function tickPractice(db: MissionClient, userId: string, key: 'bible_reading' | 'prayer', logDate: string): Promise<void> {
  const { data: practice } = await db.from('practices').select('id').eq('user_id', userId).eq('key', key).eq('active', true).maybeSingle();
  if (!practice) return;
  await db
    .from('practice_logs')
    .upsert(
      { user_id: userId, practice_id: practice.id, log_date: logDate, completed: true, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,practice_id,log_date' },
    );
}
