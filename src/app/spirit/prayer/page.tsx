import { supabaseServer } from '@/lib/supabase/server';
import PrayerClient from '@/components/spirit/PrayerClient';
import { DEFAULT_CATEGORIES } from '@/lib/spirit/prayer';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prayer | Spirit' };

export default async function PrayerPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [subjectsRes, requestsRes, categoriesRes] = await Promise.all([
    // Archived subjects are fetched too. They are filtered out of the praying
    // views client-side, but Organise has to be able to show what has been
    // retired — a subject you cannot see is a subject you cannot bring back.
    supabase
      .from('prayer_subjects')
      .select('id, name, category, notes, scripture_refs, parent_id, position, archived')
      .eq('user_id', user.id)
      .order('position'),
    // cadence, cadence_anchor and due_date were missing here, which quietly
    // disabled the entire scheduling feature: every request arrived with an
    // undefined cadence, so nothing was ever due and every repeat control read
    // "Once" regardless of what was stored.
    supabase
      .from('prayer_requests')
      .select(
        'id, subject_id, body, mode, status, urgent, last_prayed_at, prayed_count, answered_at, answer_note, cadence, cadence_anchor, due_date'
      )
      .eq('user_id', user.id),
    supabase
      .from('prayer_categories')
      .select('id, key, label, position, archived')
      .eq('user_id', user.id)
      .order('position'),
  ]);

  if (subjectsRes.error) console.error('[prayer] subjects:', subjectsRes.error.message);
  if (requestsRes.error) console.error('[prayer] requests:', requestsRes.error.message);
  if (categoriesRes.error) console.error('[prayer] categories:', categoriesRes.error.message);

  // Before the categories migration has been applied — or on an account that
  // has never opened this page — fall back to the journal's ten headings so the
  // list still renders under names rather than raw slugs.
  const categories =
    categoriesRes.data && categoriesRes.data.length > 0
      ? categoriesRes.data
      : DEFAULT_CATEGORIES.map((c, i) => ({
          id: `default:${c.key}`,
          key: c.key,
          label: c.label,
          position: i,
          archived: false,
        }));

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Prayer</h1>
        <p className="mt-1 text-sm text-slate-500">
          One of the gravest sins is prayerlessness — it means depending on ourselves rather
          than depending on God.
        </p>
      </div>
      <PrayerClient
        subjects={subjectsRes.data ?? []}
        requests={requestsRes.data ?? []}
        categories={categories}
      />
    </main>
  );
}
