import Link from 'next/link'
import { Caravan, ClipboardCheck, MapPin, Plus, Gauge } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { today, daysBetween } from '@/lib/day'
import { CHECKLISTS, RIG, progress, durationMinutes } from '@/lib/rv/checklists'
import { span, statusByDate, type Stop, type Trip } from '@/lib/rv/trips'
import StopFields from '@/components/rv/StopFields'

export const dynamic = 'force-dynamic'

/*
 * The RV: the rig, the two travel-day checklists, and the trips.
 *
 * Eric, 2026-09-25: a sidebar item for the RV with its instructions as the
 * summary page, trips tracked and managed, and start-up / shut-down
 * checklists that reset. Checklist content is src/lib/rv/checklists.json;
 * tick state is server-side per run (see the migration).
 *
 * Mission Control framing from the spec: the goal is zero missed steps, so
 * the numbers shown are runs completed, items skipped per run, and how long a
 * departure takes.
 */

const card = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm'
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

type RunRow = {
  id: string
  checklist_id: string
  started_at: string
  completed_at: string | null
  archived_at: string | null
  items_total: number | null
  items_checked: number | null
  location: string | null
}

type TripRow = {
  trip: Trip
  stops: Stop[]
  start: string | null
  end: string | null
  cost: number
  byDate: Trip['status'] | null
}

function fmt(d: string | null) {
  if (!d) return ''
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function RvPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const sp = searchParams ? await searchParams : undefined
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null
  const t = today()

  const [{ data: tripData }, { data: stopData }, { data: runData }, { data: checkData }] = await Promise.all([
    supabase.from('rv_trips').select('id,name,status,notes'),
    supabase
      .from('rv_trip_stops')
      .select('id,trip_id,campground,location,site,arrive_on,depart_on,confirmation,cost,hookups,url,phone,notes')
      .order('arrive_on'),
    supabase
      .from('rv_checklist_runs')
      .select('id,checklist_id,started_at,completed_at,archived_at,items_total,items_checked,location')
      .order('started_at', { ascending: false })
      .limit(200),
    supabase.from('rv_checklist_checks').select('run_id,item_id,checked_at'),
  ])

  const trips = (tripData ?? []) as Trip[]
  const stops = (stopData ?? []) as Stop[]
  const runs = (runData ?? []) as RunRow[]
  const checks = (checkData ?? []) as Array<{ run_id: string; item_id: string; checked_at: string }>

  const stopsByTrip = new Map<string, Stop[]>()
  for (const s of stops) stopsByTrip.set(s.trip_id, [...(stopsByTrip.get(s.trip_id) ?? []), s])
  const tripRows: TripRow[] = trips
    .map((trip) => {
      const own = stopsByTrip.get(trip.id) ?? []
      const { start, end } = span(own)
      const cost = own.reduce((sum, s) => sum + (Number(s.cost) || 0), 0)
      return { trip, stops: own, start, end, cost, byDate: statusByDate(own, t) }
    })
    .sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999'))

  const live = tripRows.filter((r) => r.trip.status !== 'canceled')
  const current = live.find((r) => r.start && r.end && r.start <= t && r.end >= t) ?? null
  const upcoming = live.filter((r) => r.trip.status !== 'done' && (!r.start || r.start > t))
  const past = tripRows.filter((r) => r !== current && !upcoming.includes(r)).reverse()
  const next = upcoming[0] ?? null

  /* Checklist numbers. The open run's ticks come from checks; archived runs
     carry their own frozen counts. */
  const ticksByRun = new Map<string, Array<{ item_id: string; checked_at: string }>>()
  for (const c of checks) ticksByRun.set(c.run_id, [...(ticksByRun.get(c.run_id) ?? []), c])

  const stats = CHECKLISTS.map((c) => {
    const open = runs.find((r) => r.checklist_id === c.id && !r.archived_at) ?? null
    const openProgress = progress(c, (open ? ticksByRun.get(open.id) ?? [] : []).map((x) => x.item_id))
    const archived = runs.filter((r) => r.checklist_id === c.id && r.archived_at)
    const skipped = archived.map((r) => (r.items_total ?? 0) - (r.items_checked ?? 0))
    const durations = archived
      .map((r) => {
        const last = (ticksByRun.get(r.id) ?? []).map((x) => x.checked_at).sort().at(-1) ?? null
        return durationMinutes(r.started_at, r.completed_at ?? last)
      })
      .filter((m): m is number => m !== null)
    return {
      checklist: c,
      open,
      openProgress,
      runs: archived.length,
      complete: archived.filter((r) => r.items_checked === r.items_total).length,
      avgSkipped: skipped.length ? (skipped.reduce((a, b) => a + b, 0) / skipped.length).toFixed(1) : null,
      avgMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
      last: archived[0] ?? null,
    }
  })

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <h1 className="flex items-center gap-2 text-3xl font-semibold">
        <Caravan className="h-7 w-7 text-sky-600" />
        RV
      </h1>
      <p className="mt-1 text-sm text-slate-500">The rig, the travel-day checklists, and every trip.</p>

      {sp?.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sp.error}</div>}

      {/* Where are we, and what is next. First, because it is the question. */}
      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className={card}>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{current ? 'On the road' : 'Next trip'}</div>
          {(current ?? next) ? (() => {
            const r = (current ?? next)!
            const here = r.stops.find((s) => s.arrive_on <= t && (s.depart_on ?? s.arrive_on) >= t)
            const days = r.start ? daysBetween(t, r.start) : null
            return (
              <Link href={`/rv/trips/${r.trip.id}`} className="mt-2 block">
                <div className="text-lg font-semibold hover:underline">{r.trip.name}</div>
                <div className="text-sm text-slate-600">
                  {fmt(r.start)} – {fmt(r.end)} · {r.stops.length} stop{r.stops.length === 1 ? '' : 's'}
                  {!current && days !== null && ` · in ${days} day${days === 1 ? '' : 's'}`}
                </div>
                {here && (
                  <div className="mt-2 flex items-center gap-1 text-sm text-slate-700">
                    <MapPin className="h-4 w-4 text-sky-600" /> {here.campground}
                    {here.site && `, site ${here.site}`}
                    {here.depart_on && ` · leaving ${fmt(here.depart_on)}`}
                  </div>
                )}
              </Link>
            )
          })() : (
            <p className="mt-2 text-sm text-slate-500">No trip booked. Add one below.</p>
          )}
        </div>

        <div className={card}>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">The rig</div>
          <dl className="mt-2 grid gap-1 text-sm">
            <div><dt className="inline font-medium">Coach: </dt><dd className="inline text-slate-700">{RIG.coach}</dd></div>
            <div><dt className="inline font-medium">Toad: </dt><dd className="inline text-slate-700">{RIG.toad}</dd></div>
            <div><dt className="inline font-medium">Tow bar: </dt><dd className="inline text-slate-700">{RIG.towbar}</dd></div>
            <div><dt className="inline font-medium">Toad brakes: </dt><dd className="inline text-slate-700">{RIG.toad_brakes}</dd></div>
            <div className="mt-1 flex items-center gap-1">
              <Gauge className="h-4 w-4 text-slate-500" />
              <span className="text-slate-700">
                Cold PSI: coach {RIG.tire_psi.coach_front} front / {RIG.tire_psi.coach_rear} rear · Jeep {RIG.tire_psi.jeep}
              </span>
            </div>
          </dl>
        </div>
      </section>

      {/* The checklists. Big targets: this is opened at a campground, on a phone. */}
      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Travel-day checklists</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {stats.map((s) => (
            <Link key={s.checklist.id} href={`/rv/checklists/${s.checklist.id}`} className={`${card} block transition hover:border-blue-300`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <ClipboardCheck className="h-5 w-5 text-blue-600" /> {s.checklist.title}
                </div>
                <span className="text-sm font-semibold text-slate-700">
                  {s.openProgress.done} / {s.openProgress.total}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${s.openProgress.complete ? 'bg-green-600' : 'bg-blue-600'}`}
                  style={{ width: `${s.openProgress.percent}%` }}
                />
              </div>
              <div className="mt-3 text-xs text-slate-500">
                {s.openProgress.done === 0 ? 'Ready to start.' : s.openProgress.complete ? 'Done — reset it before the next one.' : 'In progress.'}
                {s.runs > 0 && (
                  <>
                    {' '}· {s.runs} run{s.runs === 1 ? '' : 's'} logged, {s.complete} fully complete
                    {s.avgSkipped !== null && ` · ${s.avgSkipped} skipped on average`}
                    {s.avgMinutes !== null && ` · ~${s.avgMinutes} min`}
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Trips. */}
      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Upcoming trips ({upcoming.length})</h2>
        <TripList rows={upcoming} />
      </section>

      <section className="mt-8">
        <details className={card} open={trips.length === 0}>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <Plus className="h-4 w-4 text-blue-600" /> Add a trip
          </summary>
          <form action="/rv/trips/new" method="post" className="mt-4 grid gap-2 sm:grid-cols-2">
            <input name="name" required placeholder="Trip name — e.g. Smokies, October" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2" />
            <p className="text-xs text-slate-500 sm:col-span-2">First stop (add more on the trip page):</p>
            <StopFields />
            <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white sm:col-span-2" type="submit">
              Add trip
            </button>
          </form>
        </details>
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Past and canceled ({past.length})</h2>
          <TripList rows={past} />
        </section>
      )}
    </main>
  )
}

function TripList({ rows }: { rows: TripRow[] }) {
  if (rows.length === 0) return <p className="mt-3 text-sm text-slate-500">None.</p>
  return (
    <div className="mt-3 grid gap-2">
      {rows.map((r) => (
        <Link
          key={r.trip.id}
          href={`/rv/trips/${r.trip.id}`}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-blue-300"
        >
          <div className="min-w-0">
            <div className="font-medium">{r.trip.name}</div>
            <div className="text-xs text-slate-500">
              {r.start ? `${fmt(r.start)} – ${fmt(r.end)}` : 'No dates yet'} · {r.stops.map((s) => s.campground).join(' → ') || 'no stops'}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {r.cost > 0 && <span>{money(r.cost)}</span>}
            <span className="rounded-full bg-slate-100 px-2 py-0.5">{r.trip.status}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
