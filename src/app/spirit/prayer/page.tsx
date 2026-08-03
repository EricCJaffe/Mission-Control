import { supabaseServer } from '@/lib/supabase/server';
import PrayerClient from '@/components/spirit/PrayerClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prayer | Spirit' };

export default async function PrayerPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [subjectsRes, requestsRes] = await Promise.all([
    supabase
      .from('prayer_subjects')
      .select('id, name, category, notes, scripture_refs, parent_id, position')
      .eq('user_id', user.id)
      .eq('archived', false)
      .order('position'),
    supabase
      .from('prayer_requests')
      .select('id, subject_id, body, mode, status, urgent, last_prayed_at, prayed_count, answered_at, answer_note')
      .eq('user_id', user.id),
  ]);

  if (subjectsRes.error) console.error('[prayer] subjects:', subjectsRes.error.message);
  if (requestsRes.error) console.error('[prayer] requests:', requestsRes.error.message);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Prayer</h1>
        <p className="mt-1 text-sm text-slate-500">
          One of the gravest sins is prayerlessness — it means depending on ourselves rather
          than depending on God.
        </p>
      </div>
      <PrayerClient subjects={subjectsRes.data ?? []} requests={requestsRes.data ?? []} />
    </main>
  );
}
