import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';
import TemplatesClient from '@/components/fitness/TemplatesClient';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: templates } = await supabase
    .from('workout_templates')
    .select('id, name, type, split_type, estimated_duration_min, ai_generated, structure, notes, created_at')
    .eq('user_id', user.id)
    .order('name', { ascending: true });

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Workout Templates</h1>
          <p className="mt-1 text-sm text-slate-500">Reusable workout structures — use as starting points when logging.</p>
        </div>
        <Link href="/fitness" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
      </div>
      <TemplatesClient templates={templates ?? []} />
    </main>
  );
}
