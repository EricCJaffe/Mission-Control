import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Who a health record is about.
 *
 * Eric manages Mary Jo's labs, medications and appointments so he can talk to
 * her doctors; she will never log in. So this is a person dimension inside one
 * account, not multi-user auth — "husband mode", not a second login.
 *
 * The rule that keeps it safe: everything defaults to the SELF person, and only
 * pages that deliberately opt in can view anyone else. The AI context,
 * health.md, morning briefing and command centre must always call
 * `selfPersonId` so a spouse's numbers can never reach the account holder's
 * trends or his cardiologist prep.
 */

export type Person = {
  id: string;
  full_name: string;
  relationship: 'self' | 'spouse' | 'child' | 'parent' | 'other';
  date_of_birth: string | null;
  sex: string | null;
  is_self: boolean;
  active: boolean;
};

/** Cookie holding the person currently being viewed. */
export const PERSON_COOKIE = 'mc_person';

export async function listPeople(
  supabase: SupabaseClient,
  userId: string
): Promise<Person[]> {
  const { data } = await supabase
    .from('people')
    .select('id, full_name, relationship, date_of_birth, sex, is_self, active')
    .eq('user_id', userId)
    .eq('active', true)
    // Self first, then alphabetical — the account holder is the common case.
    .order('is_self', { ascending: false })
    .order('full_name');
  return (data ?? []) as Person[];
}

/**
 * The account holder's own person row.
 *
 * Anything feeding AI context, health.md or the briefing must scope to this and
 * NOT to the viewed person.
 */
export async function selfPersonId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('people')
    .select('id')
    .eq('user_id', userId)
    .eq('is_self', true)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * The person being viewed: whatever the switcher last set, falling back to
 * self. A stale or foreign cookie value falls back rather than erroring, so a
 * deleted person cannot leave the health module unusable.
 */
export async function activePerson(
  supabase: SupabaseClient,
  userId: string
): Promise<{ person: Person | null; people: Person[] }> {
  const people = await listPeople(supabase, userId);
  if (people.length === 0) return { person: null, people };

  const requested = (await cookies()).get(PERSON_COOKIE)?.value;
  const match = requested ? people.find((p) => p.id === requested) : undefined;
  return { person: match ?? people.find((p) => p.is_self) ?? people[0], people };
}

/** Years old today, for display next to a name. */
export function ageOf(person: Pick<Person, 'date_of_birth'>): number | null {
  if (!person.date_of_birth) return null;
  const [y, m, d] = person.date_of_birth.split('-').map(Number);
  if (!y) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const beforeBirthday =
    today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}
