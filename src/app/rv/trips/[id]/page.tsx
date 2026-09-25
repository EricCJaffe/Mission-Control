import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft, MapPin, Phone, ExternalLink, Plus, Trash2, ClipboardCheck, Fuel, AlertTriangle, Flower2, FileText, Check, Sun,
} from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { today, daysBetween } from '@/lib/day'
import { loadTrips, type TripBundle, type TripDoc } from '@/lib/rv/load'
import {
  callSheet, deadlines, nights, statusByDate, stillToBook, todayView, TRIP_STATUSES, RIG_LIMITS,
  type Reservation, type Stop,
} from '@/lib/rv/trips'
import StopFields from '@/components/rv/StopFields'
import ReservationFields from '@/components/rv/ReservationFields'

export const dynamic = 'force-dynamic'

/*
 * One trip, in the tabs the pack's planner asked for. Every tab reads the same
 * bundle (src/lib/rv/load.ts); Still to Book, Today and the deadlines are
 * derived from it, never stored.
 */

const card = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm'
const input = 'rounded-xl border border-slate-200 px-3 py-2 text-sm'
const primary = 'rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white'
const money = (n: number | null) => (n === null || n === undefined ? null : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' }))
const mapHref = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

function fmt(d: string | null, withDay = true) {
  if (!d) return 'date TBD'
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { ...(withDay ? { weekday: 'short' } : {}), month: 'short', day: 'numeric' })
}
function fmtInstant(iso: string) {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const TABS: Array<[string, string]> = [
  ['today', 'Today'],
  ['itinerary', 'Itinerary'],
  ['reservations', 'Reservations'],
  ['tobook', 'Still to book'],
  ['see', 'Things to see'],
  ['fuel', 'Fuel'],
  ['hazards', 'Hazards'],
  ['todos', 'To-dos'],
  ['documents', 'Documents'],
  ['callsheet', 'Call sheet'],
  ['trip', 'Trip'],
]

export default async function RvTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string; tab?: string; garden?: string }>
}) {
  const { id } = await params
  const sp = searchParams ? await searchParams : undefined
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const [bundle] = await loadTrips(supabase, id)
  if (!bundle) notFound()
  const t = today()
  const { trip, stops, reservations, start, end } = bundle
  const byDate = statusByDate(stops, t)
  const underWay = byDate === 'in-progress'
  const tab = sp?.tab && TABS.some(([k]) => k === sp.tab) ? sp.tab : underWay ? 'today' : 'itinerary'
  const base = `/rv/trips/${id}`
  const here = `${base}?tab=${tab}`
  const toBook = stillToBook(stops, reservations)
  const totalPaid = reservations.reduce((s, r) => s + (Number(r.paid) || 0), 0)
  const totalNights = stops.reduce((s, x) => s + (x.kind === 'campground' || x.kind === 'hotel' || x.kind === 'storage' ? nights(x) ?? 0 : 0), 0)
  const daysOut = start && start > t ? daysBetween(t, start) : null
  const openTodos = bundle.tasks.filter((x) => x.status !== 'done')

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <Link href="/rv" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> RV
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">{trip.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {start ? `${fmt(start)} – ${fmt(end)}` : 'No dates yet'} · {stops.filter((s) => s.kind !== 'home').length} stops
        {totalNights > 0 && ` · ${totalNights} nights`}
        {totalPaid > 0 && ` · ${money(totalPaid)} paid`}
        {' · '}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{trip.status}</span>
      </p>
      {trip.summary && <p className="mt-2 max-w-3xl text-sm text-slate-700">{trip.summary}</p>}

      {/* The numbers the pack asked to watch: days out against what is still open. */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {daysOut !== null && <span className="rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-800">{daysOut} days to departure</span>}
        <span className={`rounded-full px-3 py-1 font-medium ${toBook.length ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {toBook.length} still to book
        </span>
        <span className={`rounded-full px-3 py-1 font-medium ${openTodos.length ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-700'}`}>
          {openTodos.length} open to-dos
        </span>
      </div>

      {byDate && byDate !== trip.status && trip.status !== 'canceled' && (
        <form action={`${base}/update`} method="post" className="mt-2 flex items-center gap-2 text-sm text-yellow-800">
          <input type="hidden" name="status" value={byDate} />
          <input type="hidden" name="redirect" value={here} />
          By the dates this trip is {byDate}.
          <button className="rounded-lg border border-yellow-300 bg-yellow-50 px-2 py-1 text-xs font-medium" type="submit">Mark {byDate}</button>
        </form>
      )}

      {/* Urgent open items (priority 1) stay red at the top of every tab until
          someone marks them fixed — the Nantucket return, for one. */}
      {bundle.tasks.filter((x) => x.priority === 1 && x.status !== 'done').map((x) => (
        <form key={x.task_id} action="/tasks/update" method="post" className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3">
          <input type="hidden" name="id" value={x.task_id} />
          <input type="hidden" name="status" value="done" />
          <input type="hidden" name="redirect" value={here} />
          <div className="flex min-w-0 items-start gap-2 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="font-medium">{x.title}</span>
          </div>
          <button type="submit" className="min-h-[40px] rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-800">Fixed</button>
        </form>
      ))}

      {sp?.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sp.error}</div>}

      {/* Tabs scroll sideways on a phone rather than wrapping into a wall. */}
      <nav className="-mx-4 mt-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 md:mx-0 md:px-0">
        {TABS.filter(([k]) => k !== 'today' || underWay).map(([k, label]) => (
          <Link
            key={k}
            href={`${base}?tab=${k}`}
            className={`whitespace-nowrap rounded-t-lg px-3 py-2 text-sm font-medium ${tab === k ? 'border-b-2 border-blue-700 text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {label}
            {k === 'tobook' && toBook.length > 0 && ` (${toBook.length})`}
            {k === 'todos' && openTodos.length > 0 && ` (${openTodos.length})`}
          </Link>
        ))}
      </nav>

      <div className="mt-5">
        {tab === 'today' && <TodayTab bundle={bundle} t={t} />}
        {tab === 'itinerary' && <ItineraryTab bundle={bundle} here={here} base={base} t={t} />}
        {tab === 'reservations' && <ReservationsTab bundle={bundle} here={here} base={base} />}
        {tab === 'tobook' && <ToBookTab bundle={bundle} base={base} />}
        {tab === 'see' && <SeeTab bundle={bundle} here={here} base={base} gardenOnly={sp?.garden === '1'} />}
        {tab === 'fuel' && <FuelTab bundle={bundle} here={here} base={base} />}
        {tab === 'hazards' && <HazardsTab bundle={bundle} base={base} />}
        {tab === 'todos' && <TodosTab bundle={bundle} here={here} base={base} />}
        {tab === 'documents' && <DocumentsTab bundle={bundle} here={here} base={base} />}
        {tab === 'callsheet' && <CallSheetTab bundle={bundle} />}
        {tab === 'trip' && <TripTab bundle={bundle} here={here} base={base} />}
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------------- */

function StopContact({ s }: { s: Stop }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
      {(s.address || s.location) && (
        <a href={mapHref(s.address ?? s.location ?? '')} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-700">
          <MapPin className="h-3 w-3" />
          {s.address ?? s.location}
        </a>
      )}
      {s.phone && (
        <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-blue-700">
          <Phone className="h-3 w-3" />
          {s.phone}
        </a>
      )}
      {s.url && (
        <a href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-700">
          <ExternalLink className="h-3 w-3" />
          website
        </a>
      )}
    </div>
  )
}

function ResCard({ r, stop, docs = [] }: { r: Reservation; stop: Stop | null; docs?: TripDoc[] }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{r.vendor ?? stop?.name}</span>
        {r.conf_number && <span className="font-mono text-sm font-bold">#{r.conf_number}</span>}
      </div>
      {r.secondary_ref && <div className="text-xs text-slate-600">{r.secondary_ref}</div>}
      <div className="mt-1 text-xs text-slate-600">
        {[r.site_type, r.check_in && `in ${r.check_in}`, r.check_out && `out ${r.check_out}`].filter(Boolean).join(' · ')}
      </div>
      {r.day_of_notes && <div className="mt-1 text-xs text-slate-800">{r.day_of_notes}</div>}
      {r.cancel_by && <div className="mt-1 text-xs font-bold text-red-700">Cancel by {fmtInstant(r.cancel_by)}</div>}
      {docs.filter((d) => d.reservation_id === r.id).map((d) => (
        <Link key={d.id} href={`/rv/documents/${d.id}`} className="mr-3 mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-700">
          <FileText className="h-3 w-3" /> {d.kind === 'confirmation' && d.path ? 'View confirmation' : d.title}
        </Link>
      ))}
    </div>
  )
}

function TodayTab({ bundle, t }: { bundle: TripBundle; t: string }) {
  const v = todayView(bundle.trip, bundle.stops, bundle.reservations, bundle.fuel, t)
  const day = bundle.stops.find((s) => s.arrive_on === t || s.depart_on === t)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={card}>
        <h2 className="flex items-center gap-2 font-semibold"><Sun className="h-4 w-4 text-yellow-500" /> {fmt(t)}</h2>
        {day?.day_summary && <p className="mt-1 text-sm text-slate-600">{day.day_summary}</p>}
        {v.leaving && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-[0.15em] text-slate-500">Leaving</div>
            <div className="font-medium">{v.leaving.name}</div>
            {v.leavingReservation?.check_out && <div className="text-sm text-slate-600">Check-out {v.leavingReservation.check_out}</div>}
            <Link href="/rv/checklists/departure" className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-medium text-white">
              <ClipboardCheck className="h-4 w-4" /> Departure checklist
            </Link>
          </div>
        )}
        {v.arriving && (
          <div className="mt-4">
            <div className="text-xs uppercase tracking-[0.15em] text-slate-500">Arriving</div>
            <div className="font-medium">{v.arriving.name}</div>
            <StopContact s={v.arriving} />
            {v.arrivingReservation && <div className="mt-2"><ResCard r={v.arrivingReservation} stop={v.arriving} docs={bundle.docs} /></div>}
            <Link href="/rv/checklists/arrival" className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-blue-300 px-4 text-sm font-medium text-blue-700">
              <ClipboardCheck className="h-4 w-4" /> Arrival checklist
            </Link>
          </div>
        )}
        {!v.leaving && !v.arriving && v.parkedAt && (
          <div className="mt-3">
            <div className="text-xs uppercase tracking-[0.15em] text-slate-500">Parked at</div>
            <div className="font-medium">{v.parkedAt.name}{v.parkedAt.site && `, site ${v.parkedAt.site}`}</div>
            <StopContact s={v.parkedAt} />
            <div className="mt-1 text-sm text-slate-600">Leaving {fmt(v.parkedAt.depart_on)}</div>
          </div>
        )}
        {v.excursions.map((x) => (
          <div key={x.id} className="mt-3">
            <div className="text-xs uppercase tracking-[0.15em] text-slate-500">{x.kind === 'ferry' ? 'Ferry' : 'Day trip'}</div>
            <div className="font-medium">{x.name}</div>
            {x.day_summary && <div className="text-sm text-slate-600">{x.day_summary}</div>}
            {bundle.reservations.filter((r) => r.stop_id === x.id).map((r) => <div key={r.id} className="mt-2"><ResCard r={r} stop={x} docs={bundle.docs} /></div>)}
          </div>
        ))}
      </div>
      <div className="grid gap-4">
        {v.fuel && (
          <div className={card}>
            <h2 className="flex items-center gap-2 font-semibold"><Fuel className="h-4 w-4 text-slate-600" /> Today&apos;s drive</h2>
            <div className="mt-1 text-sm">{v.fuel.leg} {v.fuel.miles && `· ~${v.fuel.miles} mi`}</div>
            {v.fuel.route && <div className="text-xs text-slate-500">{v.fuel.route}</div>}
            <div className="mt-2 text-sm"><span className="font-medium">Fuel: </span>{v.fuel.primary_stop}</div>
            {v.fuel.backup && <div className="text-sm text-slate-600">Backup: {v.fuel.backup}</div>}
            {v.fuel.notes && <div className="mt-1 text-sm text-slate-800">{v.fuel.notes}</div>}
          </div>
        )}
        {v.hazards.length > 0 && (
          <div className={card}>
            <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-red-600" /> Route hazards</h2>
            <ul className="mt-2 grid gap-1 text-sm">
              {v.hazards.map((h, i) => <li key={i}><span className="font-medium">{h.where}:</span> {h.rule}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function ItineraryTab({ bundle, here, base, t }: { bundle: TripBundle; here: string; base: string; t: string }) {
  const legs = bundle.trip.data.legs ?? {}
  return (
    <div className="grid gap-3">
      {bundle.stops.length === 0 && <p className="text-sm text-slate-500">No stops yet — add the first one below.</p>}
      {bundle.stops.map((s, i) => {
        const isHere = !!s.arrive_on && s.arrive_on <= t && (s.depart_on ?? s.arrive_on) >= t && s.kind !== 'home'
        const leg = s.leg ? legs[s.leg] : null
        const n = nights(s)
        const res = bundle.reservations.filter((r) => r.stop_id === s.id && r.status !== 'canceled')
        return (
          <div key={s.id} className={`${card} ${isHere ? 'border-sky-400' : ''}`} style={leg?.color ? { borderLeftColor: leg.color, borderLeftWidth: 6 } : undefined}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-xs text-sky-800">{i + 1}</span>
                  {s.name}
                  {s.kind !== 'campground' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-600">{s.kind}</span>}
                  {isHere && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">here now</span>}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {s.kind === 'home'
                    ? fmt(s.depart_on ?? s.arrive_on)
                    : s.kind === 'ferry' || s.kind === 'excursion'
                      ? fmt(s.arrive_on)
                      : `${fmt(s.arrive_on)} → ${fmt(s.depart_on)}`}
                  {n !== null && n > 0 && ` · ${n} night${n === 1 ? '' : 's'}`}
                  {s.location && ` · ${s.location}`}
                  {leg && <span className="text-xs text-slate-400"> · {leg.label}</span>}
                </div>
                {s.day_summary && <p className="mt-1 text-sm text-slate-700">{s.day_summary}</p>}
                <StopContact s={s} />
                {res.map((r) => <div key={r.id} className="mt-2"><ResCard r={r} stop={s} docs={bundle.docs} /></div>)}
                {s.notes && <p className="mt-2 text-sm text-slate-700">{s.notes}</p>}
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-blue-700">Edit stop…</summary>
              <form action={`/rv/stops/${s.id}/update`} method="post" className="mt-2 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="redirect" value={here} />
                <StopFields stop={s} />
                <button className={`${primary} sm:col-span-2`} type="submit">Save stop</button>
              </form>
              <form action={`/rv/stops/${s.id}/delete`} method="post" className="mt-2">
                <input type="hidden" name="redirect" value={here} />
                <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600" type="submit"><Trash2 className="h-3 w-3" /> Remove this stop</button>
              </form>
            </details>
          </div>
        )
      })}
      <details className={card}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-blue-600" /> Add a stop</summary>
        <form action={`${base}/stops/new`} method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <StopFields stop={{ arrive_on: bundle.end ?? undefined }} />
          <button className={`${primary} sm:col-span-2`} type="submit">Add stop</button>
        </form>
      </details>
    </div>
  )
}

function ReservationsTab({ bundle, here, base }: { bundle: TripBundle; here: string; base: string }) {
  const stopOf = (id: string | null) => bundle.stops.find((s) => s.id === id) ?? null
  const rows = [...bundle.reservations].sort((a, b) => (stopOf(a.stop_id)?.arrive_on ?? '9999').localeCompare(stopOf(b.stop_id)?.arrive_on ?? '9999'))
  return (
    <div className="grid gap-3">
      {rows.length === 0 && <p className="text-sm text-slate-500">No reservations yet.</p>}
      {rows.map((r) => {
        const s = stopOf(r.stop_id)
        return (
          <div key={r.id} className={card}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{s?.name ?? r.vendor}</div>
                <div className="text-xs text-slate-500">{[r.vendor, r.kind, s && fmt(s.arrive_on)].filter(Boolean).join(' · ')}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === 'to-book' ? 'bg-red-50 text-red-700' : r.status === 'canceled' ? 'bg-slate-100 text-slate-500' : 'bg-green-50 text-green-700'}`}>{r.status}</span>
            </div>
            <div className="mt-2"><ResCard r={r} stop={s} docs={bundle.docs} /></div>
            {s && <StopContact s={s} />}
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
              {r.paid !== null && <span>Paid {money(r.paid)}</span>}
              {r.balance_due !== null && Number(r.balance_due) > 0 && <span className="font-bold text-red-700">Balance {money(r.balance_due)}</span>}
              {r.booking_fee !== null && <span>Fee {money(r.booking_fee)}</span>}
              {r.pull_through !== null && <span>{r.pull_through ? 'Pull-through' : 'Back-in'}</span>}
              {r.amp && <span>{r.amp}-amp</span>}
            </div>
            {r.cancel_policy && <p className="mt-1 text-xs text-slate-500">{r.cancel_policy}</p>}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-blue-700">Edit…</summary>
              <form action={`/rv/reservations/${r.id}/update`} method="post" className="mt-2 grid gap-2 sm:grid-cols-2">
                <input type="hidden" name="redirect" value={here} />
                <ReservationFields r={r} stops={bundle.stops} />
                <button className={`${primary} sm:col-span-2`} type="submit">Save</button>
              </form>
              <form action={`/rv/reservations/${r.id}/delete`} method="post" className="mt-2">
                <input type="hidden" name="redirect" value={here} />
                <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600" type="submit"><Trash2 className="h-3 w-3" /> Delete reservation</button>
              </form>
            </details>
          </div>
        )
      })}
      <details className={card}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-blue-600" /> Add a reservation</summary>
        <form action={`${base}/reservations/new`} method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <ReservationFields stops={bundle.stops} />
          <button className={`${primary} sm:col-span-2`} type="submit">Add</button>
        </form>
      </details>
    </div>
  )
}

function ToBookTab({ bundle, base }: { bundle: TripBundle; base: string }) {
  const list = stillToBook(bundle.stops, bundle.reservations)
  const dl = deadlines(bundle.reservations, bundle.stops, new Date().toISOString(), 120)
  return (
    <div className="grid gap-4">
      {list.length === 0 ? (
        <div className="rounded-2xl border border-green-300 bg-green-50 p-4 text-sm font-medium text-green-800">
          Everything is booked. {bundle.reservations.filter((r) => r.status !== 'canceled').length} reservations on file.
        </div>
      ) : (
        <div className="grid gap-2">
          {list.map((x, i) => (
            <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-white px-4 py-3">
              <div>
                <div className="font-medium">{x.stop?.name ?? x.reservation?.vendor}</div>
                <div className="text-xs text-slate-500">{x.reason}{x.stop?.arrive_on && ` · ${fmt(x.stop.arrive_on)}`}</div>
              </div>
              <Link href={`${base}?tab=callsheet`} className="text-sm font-medium text-blue-700">Call sheet →</Link>
            </div>
          ))}
        </div>
      )}
      {dl.length > 0 && (
        <div className={card}>
          <h2 className="font-semibold">Upcoming deadlines</h2>
          <ul className="mt-2 grid gap-1 text-sm">
            {dl.map((d, i) => <li key={i}><span className="font-bold text-red-700">{fmtInstant(d.at)}</span> — {d.label}</li>)}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Each is also a task in Tasks and the weekly brief.</p>
        </div>
      )}
    </div>
  )
}

function SeeTab({ bundle, here, base, gardenOnly }: { bundle: TripBundle; here: string; base: string; gardenOnly: boolean }) {
  const stops = bundle.stops.filter((s) => s.kind !== 'home')
  return (
    <div className="grid gap-4">
      <div className="flex gap-2 text-sm">
        <Link href={`${base}?tab=see`} className={`rounded-full px-3 py-1 ${!gardenOnly ? 'bg-blue-700 text-white' : 'border border-slate-300'}`}>Everything</Link>
        <Link href={`${base}?tab=see&garden=1`} className={`flex items-center gap-1 rounded-full px-3 py-1 ${gardenOnly ? 'bg-blue-700 text-white' : 'border border-slate-300'}`}>
          <Flower2 className="h-3.5 w-3.5" /> Gardens
        </Link>
      </div>
      {stops.map((s) => {
        const pois = bundle.pois.filter((p) => p.stop_id === s.id && (!gardenOnly || p.garden))
        if (pois.length === 0) return null
        return (
          <div key={s.id} className={card}>
            <h2 className="font-semibold">{s.name}</h2>
            <div className="text-xs text-slate-500">{fmt(s.arrive_on)}</div>
            <div className="mt-2 grid gap-2">
              {pois.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <span className="font-medium">{p.name}</span>
                    {p.garden && <Flower2 className="ml-1 inline h-3.5 w-3.5 text-green-700" aria-label="garden" />}
                    {p.description && <span className="text-slate-600"> — {p.description}</span>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <form action={`/rv/pois/${p.id}/toggle`} method="post">
                      <input type="hidden" name="redirect" value={here} />
                      <button type="submit" title={p.chosen ? 'On the plan' : 'Add to the plan'} className={`flex h-9 w-9 items-center justify-center rounded-lg border ${p.chosen ? 'border-green-300 bg-green-50 text-green-700' : 'border-slate-200 text-slate-400'}`}>
                        <Check className="h-4 w-4" />
                      </button>
                    </form>
                    <form action={`/rv/pois/${p.id}/delete`} method="post">
                      <input type="hidden" name="redirect" value={here} />
                      <button type="submit" title="Remove" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      <details className={card}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-blue-600" /> Add a place</summary>
        <form action={`${base}/pois/new`} method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <select name="stop_id" required className={`${input} bg-white`} aria-label="Near which stop">
            {stops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input name="name" required placeholder="Place" className={input} />
          <input name="description" placeholder="Why go — distance, what it is" className={`${input} sm:col-span-2`} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="garden" className="h-4 w-4" /> Garden (Mary Jo)</label>
          <button className={primary} type="submit">Add</button>
        </form>
      </details>
    </div>
  )
}

function FuelTab({ bundle, here, base }: { bundle: TripBundle; here: string; base: string }) {
  const total = bundle.fuel.reduce((s, f) => s + (f.miles ?? 0), 0)
  return (
    <div className="grid gap-4">
      {(bundle.trip.data.fuel_rules ?? []).length > 0 && (
        <div className={card}>
          <h2 className="font-semibold">Rules</h2>
          <ul className="mt-2 list-disc pl-5 text-sm text-slate-700">
            {bundle.trip.data.fuel_rules!.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
      <div className="grid gap-2">
        {bundle.fuel.map((f) => (
          <div key={f.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-medium">{fmt(f.drive_date)} · {f.leg}</div>
              {f.miles && <span className="text-sm text-slate-500">~{f.miles} mi</span>}
            </div>
            {f.route && <div className="text-xs text-slate-500">{f.route}</div>}
            <div className="mt-1 text-sm"><span className="font-medium">Fuel: </span>{f.primary_stop}{f.backup && <span className="text-slate-600"> · backup {f.backup}</span>}</div>
            {f.notes && <div className="text-sm text-slate-700">{f.notes}</div>}
            <form action={`/rv/fuel/${f.id}/delete`} method="post" className="mt-1">
              <input type="hidden" name="redirect" value={here} />
              <button className="text-xs text-slate-400 hover:text-red-600" type="submit">Remove</button>
            </form>
          </div>
        ))}
        {total > 0 && <p className="text-sm text-slate-500">{total.toLocaleString()} driving miles planned.</p>}
      </div>
      <details className={card}>
        <summary className="flex cursor-pointer items-center gap-2 font-semibold"><Plus className="h-4 w-4 text-blue-600" /> Add a driving day</summary>
        <form action={`${base}/fuel/new`} method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
          <input name="drive_date" type="date" className={input} aria-label="Driving day" />
          <input name="leg" placeholder="From -> To" className={input} />
          <input name="miles" type="number" placeholder="Miles" className={input} />
          <input name="route" placeholder="Route" className={input} />
          <input name="primary_stop" placeholder="Fuel stop" className={input} />
          <input name="backup" placeholder="Backup" className={input} />
          <input name="notes" placeholder="Notes" className={`${input} sm:col-span-2`} />
          <button className={`${primary} sm:col-span-2`} type="submit">Add</button>
        </form>
      </details>
    </div>
  )
}

function HazardsTab({ bundle, base }: { bundle: TripBundle; base: string }) {
  const hazards = bundle.trip.data.hazards ?? []
  return (
    <div className="grid gap-3">
      <p className="text-sm text-slate-600">Every one is checked against a {RIG_LIMITS.height}, {RIG_LIMITS.length} rig carrying propane.</p>
      {hazards.map((h, i) => (
        <div key={i} className="flex items-start justify-between gap-2 rounded-xl border border-red-200 bg-white px-4 py-3">
          <div className="text-sm"><span className="font-semibold">{h.where}:</span> {h.rule}</div>
          <form action={`${base}/hazards`} method="post">
            <input type="hidden" name="remove" value={i} />
            <button className="text-xs text-slate-400 hover:text-red-600" type="submit">Remove</button>
          </form>
        </div>
      ))}
      <form action={`${base}/hazards`} method="post" className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <input name="where" required placeholder="Where — Baltimore tunnels" className={input} />
        <input name="rule" required placeholder="Rule — propane OFF; take I-695" className={input} />
        <button className={primary} type="submit">Add</button>
      </form>
    </div>
  )
}

function TodosTab({ bundle, here, base }: { bundle: TripBundle; here: string; base: string }) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-slate-600">These are ordinary tasks: they also show in Tasks and the weekly brief.</p>
      {bundle.tasks.map((x) => {
        const done = x.status === 'done'
        return (
          <form key={x.task_id} action="/tasks/update" method="post" className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 ${done ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
            <input type="hidden" name="id" value={x.task_id} />
            <input type="hidden" name="status" value={done ? 'todo' : 'done'} />
            <input type="hidden" name="redirect" value={here} />
            <div className="min-w-0 text-sm">
              <span className={done ? 'text-slate-500 line-through' : x.priority === 1 ? 'font-semibold text-red-700' : 'font-medium'}>{x.title}</span>
              <div className="text-xs text-slate-500">
                {x.due_date && `due ${fmt(x.due_date)}`}
                {x.kind === 'pretrip' && ' · closes itself when the Pre-Trip checklist is finished'}
              </div>
            </div>
            <button type="submit" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 ${done ? 'border-green-600 bg-green-600 text-white' : 'border-slate-300'}`} aria-label={done ? 'Reopen' : 'Done'}>
              {done && <Check className="h-4 w-4" />}
            </button>
          </form>
        )
      })}
      <form action={`${base}/todos/new`} method="post" className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <input name="title" required placeholder="What needs doing before we go" className={input} />
        <input name="due" type="date" className={input} aria-label="Due" />
        <label className="flex items-center gap-1 text-sm text-red-700"><input type="checkbox" name="urgent" className="h-4 w-4" /> Urgent</label>
        <button className={primary} type="submit">Add</button>
      </form>
    </div>
  )
}

function DocumentsTab({ bundle, here, base }: { bundle: TripBundle; here: string; base: string }) {
  return (
    <div className="grid gap-3">
      {bundle.docs.map((d) => (
        <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 text-slate-500" /> {d.title}</div>
            <div className="text-xs text-slate-500">
              {[d.kind, bundle.reservations.find((r) => r.id === d.reservation_id)?.vendor, d.filename, d.source_note].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {d.path || d.url ? (
              <Link href={`/rv/documents/${d.id}`} className="text-sm font-medium text-blue-700">{d.path ? 'View' : 'Open link'}</Link>
            ) : (
              <span className="text-xs text-yellow-800">not uploaded yet</span>
            )}
            <form action={`/rv/documents/${d.id}/delete`} method="post">
              <input type="hidden" name="redirect" value={here} />
              <button className="text-xs text-slate-400 hover:text-red-600" type="submit">Delete</button>
            </form>
          </div>
        </div>
      ))}
      <form action={`${base}/documents/new`} method="post" encType="multipart/form-data" className={`${card} grid gap-2 sm:grid-cols-2`}>
        <h2 className="font-semibold sm:col-span-2">Add a document</h2>
        <input name="title" placeholder="Title (defaults to the file name)" className={input} />
        <select name="kind" defaultValue="confirmation" className={`${input} bg-white`} aria-label="Kind">
          {['itinerary-pdf', 'itinerary-html', 'confirmation', 'trip-book', 'fuel-plan', 'call-sheet', 'manual', 'other'].map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input name="file" type="file" className="text-sm sm:col-span-2" />
        <input name="url" placeholder="…or a link" className={`${input} sm:col-span-2`} />
        <button className={`${primary} sm:col-span-2`} type="submit">Save — private, never a public link</button>
      </form>
    </div>
  )
}

function CallSheetTab({ bundle }: { bundle: TripBundle }) {
  const stops = bundle.stops.filter((s) => s.kind !== 'home')
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <span className="font-semibold">Say this on every call: </span>
        &ldquo;{RIG_LIMITS.length} Class C motorhome towing a Jeep, 30-amp, full hookup — pull-through if you have one. Which sites have the widest approach?&rdquo;
      </div>
      {stops.map((s) => {
        const r = bundle.reservations.find((x) => x.stop_id === s.id && x.status !== 'canceled') ?? null
        const sheet = callSheet(s, r)
        return (
          <div key={s.id} className={card}>
            <h2 className="font-semibold">{s.name}{s.location && ` — ${s.location}`}</h2>
            <StopContact s={s} />
            <div className="mt-1 text-sm text-slate-600">
              {fmt(s.arrive_on)}{s.depart_on && ` – ${fmt(s.depart_on)}`}{nights(s) ? ` (${nights(s)} nights)` : ''}
            </div>
            {sheet.flags.length > 0 && (
              <ul className="mt-2 grid gap-1 text-sm">
                {sheet.flags.map((f, i) => <li key={i} className="flex gap-2 text-red-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {f}</li>)}
              </ul>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-medium text-blue-700">Questions to ask</summary>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">{sheet.ask.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </details>
            <div className="mt-2 text-sm">
              <span className="font-medium">Result: </span>
              {r ? `${r.status}${r.conf_number ? ` · #${r.conf_number}` : ''}${r.site_type ? ` · ${r.site_type}` : ''}${r.paid ? ` · paid ${money(r.paid)}` : ''}${r.cancel_by ? ` · cancel by ${fmtInstant(r.cancel_by)}` : ''}` : 'not booked'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TripTab({ bundle, here, base }: { bundle: TripBundle; here: string; base: string }) {
  const { trip } = bundle
  const people = trip.data.people ?? []
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className={card}>
        <h2 className="font-semibold">Trip</h2>
        <form action={`${base}/update`} method="post" className="mt-3 grid gap-2">
          <input type="hidden" name="redirect" value={here} />
          <input name="name" defaultValue={trip.name} required className={input} aria-label="Trip name" />
          <select name="status" defaultValue={trip.status} className={`${input} bg-white`} aria-label="Status">
            {TRIP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <textarea name="summary" rows={3} defaultValue={trip.summary ?? ''} placeholder="The trip in two sentences" className={input} />
          <textarea name="notes" rows={5} defaultValue={trip.notes ?? ''} placeholder="Notes — route thoughts, who is coming" className={input} />
          <button className={primary} type="submit">Save</button>
        </form>
      </div>
      <div className="grid content-start gap-4">
        {people.length > 0 && (
          <div className={card}>
            <h2 className="font-semibold">People along the way</h2>
            <ul className="mt-2 grid gap-2 text-sm">
              {people.map((p, i) => (
                <li key={i}>
                  <span className="font-medium">{p.role}, {p.where}</span>{p.visit && ` · ${p.visit}`}
                  {p.address && <a href={mapHref(p.address)} target="_blank" rel="noreferrer" className="block text-xs text-blue-700">{p.address}</a>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {trip.data.payment_card_last4 && <p className="text-xs text-slate-500">Card on the reservations ends {trip.data.payment_card_last4}.</p>}
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-400">Delete this trip…</summary>
          <form action={`${base}/delete`} method="post" className="mt-2 flex flex-wrap items-center gap-2">
            <input name="confirm" placeholder='Type "delete"' className={input} />
            <button className="rounded-xl border border-red-300 px-3 py-2 text-sm text-red-700" type="submit">Delete trip, stops, reservations and its tasks</button>
            <span className="text-xs text-slate-400">To keep the record, set it to canceled.</span>
          </form>
        </details>
      </div>
    </div>
  )
}
