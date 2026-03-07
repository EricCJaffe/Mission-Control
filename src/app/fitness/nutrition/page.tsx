import NutritionClient from '@/components/fitness/NutritionClient';
import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function NutritionPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

  const [{ data: logs }, { data: target }] = await Promise.all([
    supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', user.id)
      .gte('logged_at', sevenDaysAgo.toISOString())
      .order('logged_at', { ascending: false }),
    supabase
      .from('nutrition_targets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Nutrition</h1>
        <p className="mt-1 text-sm text-slate-500">
          Cardiac-aware meal suggestions, nutrient guardrails, optional logging, and AI weekly summaries.
        </p>
      </div>
      <NutritionClient
        initialLogs={logs || []}
        initialTarget={target}
      />
    </main>
  );
}
