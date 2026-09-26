import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { OPS_CHECKLISTS, progress, durationMinutes } from '@/lib/rv/checklists'

export const dynamic = 'force-dynamic'

const card = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm'

/*
 * Procedures that are not the RV's, run on a phone the same way: the
 * two-account setup and switch first. The RV's travel-day lists stay on /rv.
 */
export default async function ChecklistsPage() {
  const supabase = await supabaseServer()
  const ids = OPS_CHECKLISTS.map((c) => c.id)
  const { data: runData } = await supabase
    .from('rv_checklist_runs')
    .select('id,checklist_id,started_at,completed_at,archived_at')
    .in('checklist_id', ids)
    .order('started_at', { ascending: false })
    .limit(100)
  const runs = (runData ?? []) as Array<{ id: string; checklist_id: string; started_at: string; completed_at: string | null; archived_at: string | null }>
  const { data: checkData } = runs.length
    ? await supabase.from('rv_checklist_checks').select('run_id,item_id').in('run_id', runs.map((r) => r.id))
    : { data: [] }
  const ticks = (checkData ?? []) as Array<{ run_id: string; item_id: string }>

  const stats = OPS_CHECKLISTS.map((c) => {
    const open = runs.find((r) => r.checklist_id === c.id && !r.archived_at) ?? null
    const p = progress(c, open ? ticks.filter((t) => t.run_id === open.id).map((t) => t.item_id) : [])
    const durations = runs
      .filter((r) => r.checklist_id === c.id && r.archived_at)
      .map((r) => durationMinutes(r.started_at, r.completed_at))
      .filter((m): m is number => m !== null)
    return {
      checklist: c,
      p,
      runs: durations.length,
      avgMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    }
  })

  return (
    <main className="pt-4 pb-16 md:pt-8">
      <h1 className="text-2xl font-semibold">Checklists</h1>
      <p className="mt-1 text-sm text-slate-500">Procedures, in the only order that is safe. Travel-day lists are on the RV page.</p>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {stats.map((s) => (
          <Link key={s.checklist.id} href={`/checklists/${s.checklist.id}`} className={`${card} block transition hover:border-blue-300`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-5 w-5 text-blue-600" /> {s.checklist.title}</div>
              <span className="text-sm font-semibold text-slate-700">{s.p.done}/{s.p.total}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${s.p.complete ? 'bg-green-600' : 'bg-blue-600'}`} style={{ width: `${s.p.percent}%` }} />
            </div>
            <div className="mt-2 text-xs text-slate-500">
              {s.checklist.duration}
              {' · '}
              {s.p.done === 0 ? 'Ready.' : s.p.complete ? 'Done — reset before the next one.' : 'In progress.'}
              {s.runs > 0 && ` · ${s.runs} logged${s.avgMinutes !== null ? ` · ~${s.avgMinutes} min actual` : ''}`}
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
