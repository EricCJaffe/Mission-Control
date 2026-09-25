import Link from 'next/link'
import { Caravan, ClipboardCheck, MapPin, Plus, BookOpen, Wrench, Truck, AlertTriangle, CalendarClock } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { today, daysBetween } from '@/lib/day'
import { CHECKLISTS, progress, durationMinutes } from '@/lib/rv/checklists'
import { loadTrips, type TripBundle } from '@/lib/rv/load'
import { deadlines, stillToBook, todayView } from '@/lib/rv/trips'
import { ASSET_COLUMNS, loadPlans, VERDICT_CLASS, type AssetRow } from '@/lib/maintenance/load'
import { dueLabel } from '@/lib/maintenance/status'
import IssuesList, { ISSUE_COLUMNS, type IssueRow } from '@/components/maintenance/IssuesList'
import StopFields from '@/components/rv/StopFields'

export const dynamic = 'force-dynamic'

/*
 * The RV at a glance: where we are or where we go next, what is due before we
 * go, the travel-day checklists, and the rig's maintenance.
 *
 * MAINTENANCE IS NOT KEPT HERE. The coach, its generator and the Jeep are
 * assets in /maintenance, with their schedules, service log and open issues;
 * this page only reads them. Eric, 2026-09-25: "the maintenance details would
 * be shared. Sourced in our maintenance module and also displayed in the rv
 * module." Which assets count as the rig is listed in the rig profile
 * (`maintenance_assets`), so a second RV or a new toad is a data change.
 *
 * The pack's metrics, all on this page: runs completed, items skipped per
 * run, maintenance overdue (target 0), open issues, days to departure against
 * still-to-book.
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

  const [bundles, { data: runData }, { data: checkData }, { data: profileRow }] = await Promise.all([
    loadTrips(supabase),
    supabase.from('rv_checklist_runs').select('id,checklist_id,started_at,completed_at,archived_at,items_total,items_checked').order('started_at', { ascending: false }).limit(300),
    supabase.from('rv_checklist_checks').select('run_id,item_id,checked_at'),
    supabase.from('rv_profile').select('data').maybeSingle(),
  ])
  const profile = (profileRow?.data ?? {}) as { maintenance_assets?: string[]; key_numbers?: { height?: string; coach_length?: string } }
  const rigAssetIds = profile.maintenance_assets ?? []

  // The rig's maintenance, read from the maintenance module.
  const { data: assetData } = rigAssetIds.length
    ? await supabase.from('maintenance_assets').select(ASSET_COLUMNS).in('id', rigAssetIds)
    : { data: [] }
  const rigAssets = (assetData ?? []) as AssetRow[]
  const plans = await loadPlans(supabase, rigAssets, t)
  const { data: issueData } = rigAssetIds.length
    ? await supabase.from('maintenance_issues').select(ISSUE_COLUMNS).in('asset_id', rigAssetIds).neq('status', 'resolved').order('opened_on')
    : { data: [] }
  const issues = (issueData ?? []) as IssueRow[]
  const assetNames = Object.fromEntries(rigAssets.map((a) => [a.id, a.name]))
  const overdue = plans.filter((p) => p.verdict === 'red')
  const dueSoon = plans.filter((p) => p.verdict === 'yellow')

  // Trips.
  const live = bundles.filter((b) => b.trip.status !== 'canceled')
  const current = live.find((b) => b.start && b.end && b.start <= t && b.end >= t) ?? null
  const upcoming = live
    .filter((b) => b !== current && b.trip.status !== 'complete' && (!b.end || b.end >= t))
    .sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999'))
  const past = bundles.filter((b) => b !== current && !upcoming.includes(b)).sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''))
  const next = upcoming.find((b) => b.start) ?? upcoming[0] ?? null

  const allRes = bundles.flatMap((b) => b.reservations)
  const allStops = bundles.flatMap((b) => b.stops)
  const dl = deadlines(allRes, allStops, new Date().toISOString(), 30)
  const tripName = new Map(bundles.map((b) => [b.trip.id, b.trip.name]))
  const dueTodos = live
    .flatMap((b) => b.tasks.map((x) => ({ ...x, trip: b.trip })))
    .filter((x) => x.status !== 'done' && x.due_date && daysBetween(t, x.due_date) <= 14 && !x.source_ref?.startsWith('rv-cancel:'))
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))

  // Checklist numbers. Open runs count their ticks; archived runs carry frozen counts.
  const runs = (runData ?? []) as RunRow[]
  const checks = (checkData ?? []) as Array<{ run_id: string; item_id: string; checked_at: string }>
  const ticksByRun = new Map<string, typeof checks>()
  for (const c of checks) ticksByRun.set(c.run_id, [...(ticksByRun.get(c.run_id) ?? []), c])
  const stats = CHECKLISTS.map((c) => {
    const open = runs.find((r) => r.checklist_id === c.id && !r.archived_at) ?? null
    const p = progress(c, (open ? ticksByRun.get(open.id) ?? [] : []).map((x) => x.item_id))
    const archived = runs.filter((r) => r.checklist_id === c.id && r.archived_at)
    const skipped = archived.map((r) => (r.items_total ?? 0) - (r.items_checked ?? 0))
    const durations = archived
      .map((r) => durationMinutes(r.started_at, r.completed_at ?? (ticksByRun.get(r.id) ?? []).map((x) => x.checked_at).sort().at(-1) ?? null))
      .filter((m): m is number => m !== null)
    return {
      checklist: c,
      p,
      runs: archived.length,
      avgSkipped: skipped.length ? (skipped.reduce((a, b) => a + b, 0) / skipped.length).toFixed(1) : null,
      avgMinutes: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    }
  })

  const nextToBook = next ? stillToBook(next.stops, next.reservations).length : 0
  const daysOut = next?.start && next.start > t ? daysBetween(t, next.start) : null

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold">
            <Caravan className="h-7 w-7 text-sky-600" />
            RV
          </h1>
          <p className="mt-1 text-sm text-slate-500">Trips, travel-day checklists, and the rig.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/rv/rig" className="flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-300 px-3 font-medium text-slate-700"><Truck className="h-4 w-4" /> Rig</Link>
          <Link href="/rv/guides" className="flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-300 px-3 font-medium text-slate-700"><BookOpen className="h-4 w-4" /> Guides</Link>
        </div>
      </div>

      {sp?.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sp.error}</div>}

      {/* The numbers first. */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: daysOut !== null ? 'Days to departure' : 'Next trip', value: daysOut ?? (current ? 'now' : '—'), cls: 'text-slate-900' },
          { label: 'Still to book', value: nextToBook, cls: nextToBook ? 'text-red-700' : 'text-green-700' },
          { label: 'Maintenance overdue', value: overdue.length, cls: overdue.length ? 'text-red-700' : 'text-green-700' },
          { label: 'Open issues', value: issues.length, cls: issues.length ? 'text-red-700' : 'text-green-700' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.15em] text-slate-500">{s.label}</div>
            <div className={`mt-1 text-2xl font-semibold ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {current ? <TodayCard b={current} t={t} /> : <NextCard b={next} t={t} />}

        <div className={card}>
          <h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-red-600" /> Due soon</h2>
          {dl.length === 0 && dueTodos.length === 0 && <p className="mt-2 text-sm text-slate-500">Nothing in the next two weeks.</p>}
          <ul className="mt-2 grid gap-2 text-sm">
            {dl.map((d, i) => (
              <li key={`d${i}`}>
                <Link href={`/rv/trips/${d.tripId}?tab=tobook`} className="hover:underline">
                  <span className="font-bold text-red-700">
                    {new Date(d.at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>{' '}
                  {d.label} <span className="text-xs text-slate-400">({tripName.get(d.tripId)})</span>
                </Link>
              </li>
            ))}
            {dueTodos.map((x) => (
              <li key={x.task_id}>
                <Link href={`/rv/trips/${x.trip.id}?tab=todos`} className="hover:underline">
                  <span className={`font-medium ${x.due_date! < t ? 'text-red-700' : 'text-slate-900'}`}>{fmt(x.due_date)}</span> {x.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The checklists: opened at a campground, on a phone. */}
      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Checklists</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {stats.map((s) => (
            <Link key={s.checklist.id} href={`/rv/checklists/${s.checklist.id}`} className={`${card} block transition hover:border-blue-300`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-5 w-5 text-blue-600" /> {s.checklist.title}</div>
                <span className="text-sm font-semibold text-slate-700">{s.p.done}/{s.p.total}</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${s.p.complete ? 'bg-green-600' : 'bg-blue-600'}`} style={{ width: `${s.p.percent}%` }} />
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {s.p.done === 0 ? 'Ready.' : s.p.complete ? 'Done — reset before the next one.' : 'In progress.'}
                {s.runs > 0 && ` · ${s.runs} logged${s.avgSkipped !== null ? ` · ${s.avgSkipped} skipped avg` : ''}${s.avgMinutes !== null ? ` · ~${s.avgMinutes} min` : ''}`}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* The rig's maintenance, from /maintenance. */}
      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Rig maintenance</h2>
          <Link href="/maintenance" className="text-xs font-medium text-blue-700">All maintenance →</Link>
        </div>
        {rigAssets.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">The coach, generator and Jeep are not linked to maintenance items yet.</p>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {rigAssets.map((a) => {
              const own = plans.filter((p) => p.asset_id === a.id)
              const worst = own.find((p) => p.verdict === 'red') ?? own.find((p) => p.verdict === 'yellow') ?? own[0]
              return (
                <Link key={a.id} href={`/maintenance/${a.id}`} className={`${card} block hover:border-blue-300`}>
                  <div className="flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4 text-orange-600" /> {a.name}</div>
                  <div className="text-xs text-slate-500">
                    {[a.model_year, a.make, a.model].filter(Boolean).join(' ')}
                    {a.meter_reading !== null && a.meter_unit && ` · ${Number(a.meter_reading).toLocaleString()} ${a.meter_unit}`}
                  </div>
                  <div className="mt-2 flex gap-2 text-xs">
                    <span className={`rounded-full border px-2 py-0.5 ${VERDICT_CLASS.red}`}>{own.filter((p) => p.verdict === 'red').length} overdue</span>
                    <span className={`rounded-full border px-2 py-0.5 ${VERDICT_CLASS.yellow}`}>{own.filter((p) => p.verdict === 'yellow').length} soon</span>
                  </div>
                  {worst && <div className="mt-2 text-xs text-slate-600">Next: {worst.task.title.replace(`${a.name}: `, '')} ({dueLabel(worst.days)})</div>}
                </Link>
              )
            })}
          </div>
        )}
        {(overdue.length > 0 || dueSoon.length > 0) && (
          <ul className="mt-3 grid gap-1 text-sm">
            {[...overdue, ...dueSoon].slice(0, 8).map((p) => (
              <li key={p.task_id}>
                <Link href={`/maintenance/${p.asset_id}`} className="hover:underline">
                  <span className={`mr-2 rounded-full border px-2 py-0.5 text-xs ${VERDICT_CLASS[p.verdict]}`}>{dueLabel(p.days)}</span>
                  {p.task.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-red-600" /> Open issues</h3>
          <div className="mt-2"><IssuesList issues={issues} redirect="/rv" assetNames={assetNames} /></div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Upcoming trips ({upcoming.length})</h2>
        <TripList rows={upcoming} />
      </section>

      <section className="mt-6">
        <details className={card} open={bundles.length === 0}>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-blue-600" /> Plan a trip</summary>
          <form action="/rv/trips/new" method="post" className="mt-4 grid gap-2 sm:grid-cols-2">
            <input name="trip_name" required placeholder="Trip name — e.g. Smokies, October" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2" />
            <input name="summary" placeholder="The idea in one line" className="rounded-xl border border-slate-200 px-3 py-2 text-sm sm:col-span-2" />
            <p className="text-xs text-slate-500 sm:col-span-2">
              First stop, if you know it — the binding constraint, the one hardest to book. Add the rest on the trip page; its call sheet applies the booking rules.
            </p>
            <StopFields />
            <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white sm:col-span-2" type="submit">Create trip</button>
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

function NextCard({ b, t }: { b: TripBundle | null; t: string }) {
  if (!b) {
    return (
      <div className={card}>
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Next trip</div>
        <p className="mt-2 text-sm text-slate-500">Nothing planned.</p>
      </div>
    )
  }
  const days = b.start && b.start > t ? daysBetween(t, b.start) : null
  const toBook = stillToBook(b.stops, b.reservations).length
  return (
    <Link href={`/rv/trips/${b.trip.id}`} className={`${card} block hover:border-blue-300`}>
      <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Next trip</div>
      <div className="mt-1 text-lg font-semibold">{b.trip.name}</div>
      <div className="text-sm text-slate-600">
        {b.start ? `${fmt(b.start)} – ${fmt(b.end)}` : 'No dates yet'}
        {days !== null && ` · in ${days} day${days === 1 ? '' : 's'}`}
      </div>
      {b.trip.summary && <p className="mt-2 line-clamp-3 text-sm text-slate-700">{b.trip.summary}</p>}
      <div className="mt-2 text-xs text-slate-500">{toBook === 0 ? 'Everything booked.' : `${toBook} still to book.`}</div>
    </Link>
  )
}

function TodayCard({ b, t }: { b: TripBundle; t: string }) {
  const v = todayView(b.trip, b.stops, b.reservations, b.fuel, t)
  return (
    <Link href={`/rv/trips/${b.trip.id}?tab=today`} className={`${card} block border-sky-400 hover:border-blue-400`}>
      <div className="text-xs uppercase tracking-[0.2em] text-sky-700">On the road · {b.trip.name}</div>
      {v.leaving && <div className="mt-2 text-sm">Leaving <span className="font-medium">{v.leaving.name}</span>{v.leavingReservation?.check_out && ` by ${v.leavingReservation.check_out}`}</div>}
      {v.arriving && <div className="mt-1 text-sm">Arriving <span className="font-medium">{v.arriving.name}</span>{v.arrivingReservation?.check_in && ` · check-in ${v.arrivingReservation.check_in}`}</div>}
      {!v.leaving && !v.arriving && v.parkedAt && (
        <div className="mt-2 flex items-center gap-1 text-sm"><MapPin className="h-4 w-4 text-sky-600" /> {v.parkedAt.name}{v.parkedAt.site && `, site ${v.parkedAt.site}`}</div>
      )}
      {v.fuel && <div className="mt-2 text-sm">Fuel: {v.fuel.primary_stop}</div>}
      {v.hazards.length > 0 && <div className="mt-1 text-sm text-red-700">{v.hazards.length} route hazard{v.hazards.length === 1 ? '' : 's'} today</div>}
      <div className="mt-2 text-xs font-medium text-blue-700">Open today →</div>
    </Link>
  )
}

function TripList({ rows }: { rows: TripBundle[] }) {
  if (rows.length === 0) return <p className="mt-3 text-sm text-slate-500">None.</p>
  return (
    <div className="mt-3 grid gap-2">
      {rows.map((r) => {
        const paid = r.reservations.reduce((s, x) => s + (Number(x.paid) || 0), 0)
        const names = r.stops.filter((s) => s.kind === 'campground' || s.kind === 'hotel').map((s) => s.name)
        return (
          <Link key={r.trip.id} href={`/rv/trips/${r.trip.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-blue-300">
            <div className="min-w-0">
              <div className="font-medium">{r.trip.name}</div>
              <div className="truncate text-xs text-slate-500">
                {r.start ? `${fmt(r.start)} – ${fmt(r.end)}` : 'No dates yet'} · {names.length ? `${names.length} stays` : 'no stops'}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              {paid > 0 && <span>{money(paid)}</span>}
              <span className="rounded-full bg-slate-100 px-2 py-0.5">{r.trip.status}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
