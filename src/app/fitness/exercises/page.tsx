import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';

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

  const categories = ['push', 'pull', 'legs', 'core', 'cardio', 'mobility'] as const;
  const grouped = new Map<string, typeof exercises>();
  for (const cat of categories) {
    grouped.set(cat, exercises?.filter((e) => e.category === cat) ?? []);
  }

  const catLabels: Record<string, string> = {
    push: '🏋️ Push',
    pull: '💪 Pull',
    legs: '🦵 Legs',
    core: '🧱 Core',
    cardio: '🏃 Cardio',
    mobility: '🧘 Mobility',
  };

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Exercise Library</h1>
          <p className="mt-1 text-sm text-slate-500">
            {exercises?.length ?? 0} exercises — global library + your custom exercises.
          </p>
        </div>
        <Link
          href="/fitness"
          className="text-xs text-slate-400 hover:text-slate-600"
        >
          ← Dashboard
        </Link>
      </div>

      {/* Add exercise form */}
      <form action="/fitness/exercises/new" method="post" className="mb-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Add Custom Exercise</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <input name="name" required placeholder="Exercise name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <select name="category" required className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            {categories.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
          <input name="equipment" placeholder="Equipment (optional)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <button type="submit" className="rounded-xl bg-slate-800 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-700 min-h-[44px]">
            Add
          </button>
        </div>
      </form>

      {/* Exercise list by category */}
      <div className="space-y-6">
        {categories.map((cat) => {
          const catExercises = grouped.get(cat) ?? [];
          if (catExercises.length === 0) return null;
          return (
            <div key={cat}>
              <h2 className="text-sm font-semibold text-slate-600 mb-2">{catLabels[cat]}</h2>
              <div className="rounded-2xl border border-white/80 bg-white/70 shadow-sm overflow-hidden divide-y divide-slate-100">
                {catExercises.map((e) => (
                  <div key={e.id} className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-sm font-medium text-slate-800 flex-1">{e.name}</span>
                    {e.equipment && (
                      <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">{e.equipment}</span>
                    )}
                    {e.is_compound && (
                      <span className="text-xs text-blue-600 bg-blue-50 rounded-full px-2 py-0.5">Compound</span>
                    )}
                    {e.user_id && (
                      <span className="text-xs text-green-600 bg-green-50 rounded-full px-2 py-0.5">Custom</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
