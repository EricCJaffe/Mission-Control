import { supabaseServer } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function EquipmentPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: equipment } = await supabase
    .from('equipment')
    .select('*')
    .eq('user_id', user.id)
    .order('status', { ascending: true })
    .order('name', { ascending: true });

  const icons: Record<string, string> = { shoes: '👟', bike: '🚴', trainer: '🏋️', other: '🔧' };

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Equipment</h1>
          <p className="mt-1 text-sm text-slate-500">Track mileage and maintenance for shoes, bikes, and gear.</p>
        </div>
      </div>

      {equipment?.length === 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-8 shadow-sm text-center text-slate-500">
          <p className="text-lg font-medium mb-2">No equipment tracked yet.</p>
          <p className="text-sm">Add your shoes and bikes to track mileage and get replacement alerts.</p>
        </div>
      )}

      {equipment && equipment.length > 0 && (
        <div className="grid gap-3">
          {equipment.map((item) => {
            const pct = item.max_distance_miles
              ? Math.min(100, Math.round((item.total_distance_miles / item.max_distance_miles) * 100))
              : null;
            const nearingLimit = pct != null && pct >= 80;
            return (
              <div key={item.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{icons[item.type] ?? '⚙️'}</span>
                    <div>
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      {(item.brand || item.model) && (
                        <p className="text-xs text-slate-500">{[item.brand, item.model].filter(Boolean).join(' ')}</p>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs rounded-full px-2 py-0.5 font-medium shrink-0 ${
                    item.status === 'active' ? 'bg-green-100 text-green-800' :
                    item.status === 'retired' ? 'bg-slate-100 text-slate-500' :
                    'bg-orange-100 text-orange-800'
                  }`}>{item.status}</span>
                </div>

                {item.max_distance_miles != null && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>{item.total_distance_miles.toFixed(0)} mi</span>
                      <span className={nearingLimit ? 'text-orange-600 font-medium' : ''}>
                        {item.max_distance_miles} mi limit{nearingLimit ? ' ⚠️' : ''}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div
                        className={`h-1.5 rounded-full ${pct! >= 90 ? 'bg-red-500' : pct! >= 80 ? 'bg-orange-400' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form action="/fitness/equipment/new" method="post" className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Add Equipment</h2>
        <div className="grid gap-3">
          <input name="name" required placeholder="e.g. Brooks Ghost 15" className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full" />
          <div className="grid grid-cols-2 gap-3">
            <select name="type" className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="shoes">Shoes</option>
              <option value="bike">Bike</option>
              <option value="trainer">Trainer</option>
              <option value="other">Other</option>
            </select>
            <input name="brand" placeholder="Brand (optional)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input name="max_distance_miles" type="number" placeholder="Max miles (e.g. 450)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input name="purchase_date" type="date" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <button type="submit" className="rounded-xl bg-slate-800 text-white text-sm font-medium px-4 py-2 hover:bg-slate-700">
            Add Equipment
          </button>
        </div>
      </form>
    </main>
  );
}
