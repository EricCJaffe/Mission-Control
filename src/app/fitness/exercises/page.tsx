import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';
import ExerciseLibraryClient from '@/components/fitness/ExerciseLibraryClient';

export const dynamic = 'force-dynamic';

export default async function ExercisesPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name, category, equipment, muscle_groups, is_compound, is_template, user_id')
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Exercise Library</h1>
          <p className="mt-1 text-sm text-slate-500">
            {exercises?.length ?? 0} exercises — global library + your custom exercises.
          </p>
        </div>
        <Link href="/fitness" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
      </div>
      <ExerciseLibraryClient exercises={exercises ?? []} />
    </main>
  );
}
