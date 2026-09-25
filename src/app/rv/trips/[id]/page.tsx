import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, Phone, ExternalLink, Plus, Trash2, ClipboardCheck } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { today } from '@/lib/day'
import { nights, span, statusByDate, type Stop, type Trip } from '@/lib/rv/trips'
import StopFields from '@/components/rv/StopFields'

export const dynamic = 'force-dynamic'

const card = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm'
const input = 'rounded-xl border border-slate-200 px-3 py-2 text-sm'
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

type RunRow = { id: string; checklist_id: string; stop_id: string | null; started_at: string; archived_at: string | null; items_total: number | null; items_checked: number | null }

export default async function RvTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const { id } = await params
  const sp = searchParams ? await searchParams : undefined
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const { data: tripData } = await supabase.from('rv_trips').select('id,name,status,notes').eq('id', id).maybeSingle()
  if (!tripData) notFound()
  const trip = tripData as Trip
  const here = `/rv/trips/${id}`
  const t = today()

  const { data: stopData } = await supabase
    .from('rv_trip_stops')
    .select('id,trip_id,campground,location,site,arrive_on,depart_on,confirmation,cost,hookups,url,phone,notes')
    .eq('trip_id', id)
    .order('arrive_on')
  const stops = (stopData ?? []) as Stop[]

  const { data: runData } = stops.length
    ? await supabase
        .from('rv_checklist_runs')
        .select('id,checklist_id,stop_id,started_at,archived_at,items_total,items_checked')
        .in('stop_id', stops.map((s) => s.id))
    : { data: [] }
  const runs = (runData ?? []) as RunRow[]

  const { start, end } = span(stops)
  const byDate = statusByDate(stops, t)
  const totalCost = stops.reduce((sum, s) => sum + (Number(s.cost) || 0), 0)
  const totalNights = stops.reduce((sum, s) => sum + (nights(s) ?? 0), 0)

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <Link href="/rv" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> RV
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">{trip.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {start ? `${fmt(start)} – ${fmt(end)}` : 'No dates yet'} · {stops.length} stop{stops.length === 1 ? '' : 's'}
        {totalNights > 0 && ` · ${totalNights} nights`}
        {totalCost > 0 && ` · ${money(totalCost)}`} · {trip.status}
      </p>
      {byDate && byDate !== trip.status && trip.status !== 'canceled' && (
        <form action={`${here}/update`} method="post" className="mt-2 flex items-center gap-2 text-sm text-yellow-800">
          <input type="hidden" name="status" value={byDate} />
          By the dates this trip is {byDate}.
          <button className="rounded-lg border border-yellow-300 bg-yellow-50 px-2 py-1 text-xs font-medium" type="submit">
            Mark {byDate}
          </button>
        </form>
      )}

      {sp?.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sp.error}</div>}

      {byDate === 'active' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/rv/checklists/departure" className="flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-medium text-white">
            <ClipboardCheck className="h-4 w-4" /> Departure checklist
          </Link>
          <Link href="/rv/checklists/arrival" className="flex min-h-[44px] items-center gap-2 rounded-xl border border-blue-300 px-4 text-sm font-medium text-blue-700">
            <ClipboardCheck className="h-4 w-4" /> Arrival checklist
          </Link>
        </div>
      )}

      {/* The itinerary. */}
      <section className="mt-6 grid gap-3">
        {stops.length === 0 && <p className="text-sm text-slate-500">No stops yet — add the first campground below.</p>}
        {stops.map((s, i) => {
          const isHere = s.arrive_on <= t && (s.depart_on ?? s.arrive_on) >= t
          const stopRuns = runs.filter((r) => r.stop_id === s.id)
          return (
            <div key={s.id} className={`${card} ${isHere ? 'border-sky-400' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-semibold">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-xs text-sky-800">{i + 1}</span>
                    {s.campground}
                    {isHere && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">here now</span>}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {fmt(s.arrive_on)} → {fmt(s.depart_on)}
                    {nights(s) !== null && ` · ${nights(s)} night${nights(s) === 1 ? '' : 's'}`}
                    {s.site && ` · site ${s.site}`}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {s.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.location}</span>}
                    {s.hookups && <span>{s.hookups}</span>}
                    {s.confirmation && <span>Conf. {s.confirmation}</span>}
                    {s.cost !== null && <span>{money(Number(s.cost))}</span>}
                    {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-blue-700"><Phone className="h-3 w-3" />{s.phone}</a>}
                    {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-700"><ExternalLink className="h-3 w-3" />link</a>}
                  </div>
                  {s.notes && <p className="mt-2 text-sm text-slate-700">{s.notes}</p>}
                  {stopRuns.length > 0 && (
                    <p className="mt-2 text-xs text-slate-500">
                      Checklists run here:{' '}
                      {stopRuns
                        .map((r) => `${r.checklist_id} ${r.archived_at ? `${r.items_checked}/${r.items_total}` : '(open)'}`)
                        .join(' · ')}
                    </p>
                  )}
                </div>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-blue-700">Edit stop…</summary>
                <form action={`/rv/stops/${s.id}/update`} method="post" className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input type="hidden" name="redirect" value={here} />
                  <StopFields stop={s} />
                  <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white sm:col-span-2" type="submit">Save stop</button>
                </form>
                <form action={`/rv/stops/${s.id}/delete`} method="post" className="mt-2">
                  <input type="hidden" name="redirect" value={here} />
                  <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600" type="submit">
                    <Trash2 className="h-3 w-3" /> Remove this stop
                  </button>
                </form>
              </details>
            </div>
          )
        })}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h2 className="flex items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-blue-600" /> Add a stop</h2>
          <form action={`${here}/stops/new`} method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
            <StopFields stop={{ arrive_on: end ?? undefined }} />
            <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white sm:col-span-2" type="submit">Add stop</button>
          </form>
        </div>

        <div className={card}>
          <h2 className="font-semibold">Trip</h2>
          <form action={`${here}/update`} method="post" className="mt-3 grid gap-2">
            <input name="name" defaultValue={trip.name} required className={input} aria-label="Trip name" />
            <select name="status" defaultValue={trip.status} className={`${input} bg-white`} aria-label="Status">
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="done">Done</option>
              <option value="canceled">Canceled</option>
            </select>
            <textarea name="notes" rows={4} defaultValue={trip.notes ?? ''} placeholder="Route notes, reservations to make, who is coming" className={input} />
            <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white" type="submit">Save</button>
          </form>
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-slate-400">Delete this trip…</summary>
            <form action={`${here}/delete`} method="post" className="mt-2 flex flex-wrap items-center gap-2">
              <input name="confirm" placeholder='Type "delete"' className={input} />
              <button className="rounded-xl border border-red-300 px-3 py-2 text-sm text-red-700" type="submit">Delete trip and stops</button>
              <span className="text-xs text-slate-400">To keep the record, set it to Canceled.</span>
            </form>
          </details>
        </div>
      </section>
    </main>
  )
}
