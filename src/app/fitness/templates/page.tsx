import { supabaseServer } from '@/lib/supabase/server';
import Link from 'next/link';

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

  const typeIcons: Record<string, string> = {
    strength: '🏋️',
    cardio: '🏃',
    hiit: '⚡',
    hybrid: '🔥',
  };

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Workout Templates</h1>
          <p className="mt-1 text-sm text-slate-500">Reusable workout structures — use as starting points when logging.</p>
        </div>
        <Link href="/fitness" className="text-xs text-slate-400 hover:text-slate-600">← Dashboard</Link>
      </div>

      {/* Quick create form */}
      <form action="/fitness/templates/new" method="post" className="mb-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Create Template</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <input name="name" required placeholder="Template name" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <select name="type" required className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
            <option value="strength">Strength</option>
            <option value="cardio">Cardio</option>
            <option value="hiit">HIIT</option>
            <option value="hybrid">Hybrid</option>
          </select>
          <input name="split_type" placeholder="Split type (e.g. push, pull)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <button type="submit" className="rounded-xl bg-slate-800 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-700 min-h-[44px]">
            Create
          </button>
        </div>
        <div className="mt-3">
          <input name="notes" placeholder="Notes (optional)" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
        </div>
      </form>

      {templates?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-slate-400">
          <p className="text-lg">No templates yet.</p>
          <p className="text-sm mt-1">Create a template above, or one will be auto-generated when you use AI workout planning.</p>
        </div>
      )}

      {templates && templates.length > 0 && (
        <div className="grid gap-3">
          {templates.map((t) => {
            const structure = Array.isArray(t.structure) ? t.structure : [];
            const exerciseCount = structure.length;
            return (
              <div key={t.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{typeIcons[t.type ?? ''] ?? '💪'}</span>
                    <div>
                      <p className="font-semibold text-slate-800">{t.name}</p>
                      <p className="text-xs text-slate-500">
                        {t.type} · {t.split_type ?? '—'} · {exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}
                        {t.estimated_duration_min ? ` · ~${t.estimated_duration_min} min` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    {t.ai_generated && (
                      <span className="text-xs bg-purple-100 text-purple-700 rounded-full px-2 py-0.5 font-medium">AI</span>
                    )}
                  </div>
                </div>
                {t.notes && <p className="text-xs text-slate-500 mt-2">{t.notes}</p>}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
