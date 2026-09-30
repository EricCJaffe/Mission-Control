import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { addDays, today } from '@/lib/day'
import { occurrencesBetween } from '@/lib/maintenance/status'

export const dynamic = 'force-dynamic'

/*
 * The maintenance schedule as a year: twelve months, each listing what falls
 * due in it. Eric, 2026-09-30: "we probably need a calendar view of the
 * maintenance schedule as well", on the day the lawn program went in as one
 * task per month.
 *
 * Projected from each schedule's RRULE, exactly as /calendar does it
 * (src/lib/maintenance/calendar.ts), so the two can never disagree: nothing
 * here is stored. Maintenance thinks in months, not hours, which is why this
 * is a year of month cards rather than the week grid /calendar already has.
 */

type Row = {
  asset_id: string
  task: { id: string; title: string; status: string | null; due_date: string | null; recurrence_rule: string | null; recurrence_anchor: string | null } | null
  asset: { name: string; status: string } | null
}

type Item = { date: string; assetId: string; assetName: string; title: string; overdue: boolean }

const monthKey = (iso: string) => iso.slice(0, 7)
const monthLabel = (key: string) =>
  new Date(`${key}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

export default async function MaintenanceCalendarPage() {
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const todayIso = today()
  const horizon = addDays(todayIso, 365)
  const { data } = await supabase
    .from('maintenance_plans')
    .select('asset_id,task:tasks(id,title,status,due_date,recurrence_rule,recurrence_anchor),asset:maintenance_assets(name,status)')

  const items: Item[] = []
  for (const row of (data ?? []) as unknown as Row[]) {
    const task = row.task
    if (!task || task.status === 'done' || !row.asset || row.asset.status === 'retired') continue
    const title = task.title.replace(`${row.asset.name}: `, '')
    // Overdue first: an occurrence that has passed without being done is the
    // one line on this page that needs someone.
    if (task.due_date && task.due_date < todayIso) {
      items.push({ date: task.due_date, assetId: row.asset_id, assetName: row.asset.name, title, overdue: true })
    }
    for (const date of occurrencesBetween(task, todayIso, horizon)) {
      items.push({ date, assetId: row.asset_id, assetName: row.asset.name, title, overdue: false })
    }
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.assetName.localeCompare(b.assetName))

  const overdue = items.filter((i) => i.overdue)
  const months = Array.from({ length: 12 }, (_, n) => {
    const d = new Date(`${todayIso.slice(0, 7)}-15T12:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + n)
    return d.toISOString().slice(0, 7)
  })
  const byMonth = new Map<string, Item[]>(months.map((m) => [m, []]))
  for (const i of items) if (!i.overdue) byMonth.get(monthKey(i.date))?.push(i)

  return (
    <main className="pt-4 pb-16 md:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold">
            <CalendarDays className="h-7 w-7 text-orange-600" />
            Maintenance calendar
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            The next twelve months of every schedule, by month. Mark things done on{' '}
            <Link href="/maintenance" className="text-blue-700 hover:underline">Maintenance</Link> and the dates here move with them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/maintenance" className="text-sm font-medium text-blue-700 hover:underline">← Maintenance</Link>
          <Link href="/calendar" className="text-sm font-medium text-blue-700 hover:underline">Week view →</Link>
        </div>
      </div>

      {overdue.length > 0 && (
        <section className="mt-6 rounded-2xl border-2 border-red-300 bg-red-50 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-red-700">Overdue ({overdue.length})</h2>
          <ul className="mt-2 grid gap-1">
            {overdue.map((i) => (
              <li key={`${i.assetId}-${i.title}`} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="w-24 shrink-0 text-xs font-semibold text-red-700">{dayLabel(i.date)}</span>
                <Link href={`/maintenance/${i.assetId}`} className="font-medium text-slate-900 hover:underline">{i.assetName}</Link>
                <span className="text-slate-700">{i.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {months.map((m) => {
          const list = byMonth.get(m) ?? []
          return (
            <section key={m} className="min-w-0 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
              <h2 className="flex items-baseline justify-between text-sm font-semibold text-slate-900">
                {monthLabel(m)}
                <span className="text-xs font-normal text-slate-500">{list.length ? `${list.length} due` : 'Nothing due'}</span>
              </h2>
              {list.length > 0 && (
                <ul className="mt-2 divide-y divide-slate-100">
                  {list.map((i) => (
                    <li key={`${i.assetId}-${i.title}-${i.date}`} className="flex gap-2 py-1.5 text-sm">
                      <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-500">{Number(i.date.slice(8))}</span>
                      <span className="min-w-0">
                        <Link href={`/maintenance/${i.assetId}`} className="font-medium text-slate-900 hover:underline">{i.assetName}</Link>
                        <span className="text-slate-600"> · {i.title}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}
