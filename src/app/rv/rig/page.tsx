import Link from 'next/link'
import { ArrowLeft, Truck, Wrench } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/*
 * Rig Summary: the profile document, rendered. The one number that matters on
 * the road — height — is shown largest. Maintenance for each vehicle is a
 * link into /maintenance, where it is kept.
 *
 * The profile holds VINs and a plate, so it lives only in mission.rv_profile
 * behind RLS; it is never in the repo (which is public).
 */

const card = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm'

function label(key: string) {
  return key.replace(/_/g, ' ').replace(/\b(lb|in|w|gal|psi|mpg|gvwr|gawr|vin|tpms|hp)\b/gi, (m) => m.toUpperCase()).replace(/^./, (c) => c.toUpperCase())
}

/* Any value in the profile, as definition rows; nested objects become groups. */
function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === '') return <span className="text-slate-400">—</span>
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x !== 'object')) return <span>{v.join(', ')}</span>
    return (
      <ul className="grid gap-1">
        {v.map((x, i) => (
          <li key={i} className="text-sm">
            {typeof x === 'object' && x && 'item' in x ? (
              <><span className="font-medium">{String((x as { item: string }).item)}</span>{'status' in x && <span className="text-slate-500"> — {String((x as { status: string }).status)}</span>}</>
            ) : (
              <Value v={x} />
            )}
          </li>
        ))}
      </ul>
    )
  }
  if (typeof v === 'object') {
    return (
      <dl className="grid gap-1">
        {Object.entries(v as Record<string, unknown>)
          .filter(([k]) => !k.endsWith('_verify'))
          .map(([k, x]) => (
            <div key={k} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-2 text-sm">
              <dt className="text-slate-500">{label(k)}</dt>
              <dd className="min-w-0 break-words text-slate-800"><Value v={x} /></dd>
            </div>
          ))}
      </dl>
    )
  }
  if (typeof v === 'boolean') return <span>{v ? 'yes' : 'no'}</span>
  return <span>{String(v)}</span>
}

type Profile = {
  key_numbers?: Record<string, unknown> & { height?: string; coach_length?: string; combined_length_approx?: string }
  vehicles?: Array<Record<string, unknown> & { id: string; label?: string; year?: number; make?: string; model?: string }>
  tow_system?: Record<string, unknown>
  tpms?: Record<string, unknown>
  gear?: unknown[]
  travelers?: Record<string, unknown>
  maintenance_assets?: string[]
}

export default async function RigPage({ searchParams }: { searchParams?: Promise<{ edit?: string; error?: string }> }) {
  const sp = searchParams ? await searchParams : undefined
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const { data } = await supabase.from('rv_profile').select('data,updated_at').maybeSingle()
  const profile = (data?.data ?? {}) as Profile
  const { data: assets } = profile.maintenance_assets?.length
    ? await supabase.from('maintenance_assets').select('id,name').in('id', profile.maintenance_assets)
    : { data: [] }
  const k = profile.key_numbers ?? {}

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <Link href="/rv" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> RV</Link>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold"><Truck className="h-7 w-7 text-sky-600" /> The rig</h1>
      {sp?.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sp.error}</div>}

      {!data && <p className="mt-4 text-sm text-slate-500">No rig profile yet.</p>}

      {k.height && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 text-center sm:col-span-1">
            <div className="text-xs uppercase tracking-[0.2em] text-red-700">Height</div>
            <div className="text-5xl font-bold text-red-800">{k.height}</div>
            <div className="mt-1 text-xs text-red-700">Every bridge, canopy and parkway</div>
          </div>
          <div className={`${card} sm:col-span-2`}>
            <h2 className="font-semibold">Key numbers</h2>
            <div className="mt-2"><Value v={Object.fromEntries(Object.entries(k).filter(([key]) => key !== 'height'))} /></div>
          </div>
        </div>
      )}

      {assets && assets.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {assets.map((a) => (
            <Link key={a.id} href={`/maintenance/${a.id}`} className="flex items-center gap-1 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-300">
              <Wrench className="h-4 w-4 text-orange-600" /> {a.name} maintenance
            </Link>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {(profile.vehicles ?? []).map((v) => {
          const { id, label: l, year, make, model, ...rest } = v
          return (
            <div key={id} className={card}>
              <h2 className="font-semibold">{l ?? id}: {[year, make, model].filter(Boolean).join(' ')}</h2>
              <div className="mt-3"><Value v={rest} /></div>
            </div>
          )
        })}
        {profile.tow_system && <div className={card}><h2 className="font-semibold">Tow system</h2><div className="mt-3"><Value v={profile.tow_system} /></div></div>}
        {profile.tpms && <div className={card}><h2 className="font-semibold">Tires and TPMS</h2><div className="mt-3"><Value v={profile.tpms} /></div></div>}
        {profile.gear && <div className={card}><h2 className="font-semibold">Gear on board</h2><div className="mt-3"><Value v={profile.gear} /></div></div>}
      </div>

      <details className="mt-8" open={sp?.edit === '1'}>
        <summary className="cursor-pointer text-sm font-medium text-blue-700">Edit the profile (JSON)…</summary>
        <form action="/rv/rig/update" method="post" className="mt-2 grid gap-2">
          <textarea name="data" rows={24} defaultValue={JSON.stringify(profile, null, 2)} className="rounded-xl border border-slate-200 p-3 font-mono text-xs" spellCheck={false} />
          <button className="w-fit rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white" type="submit">Save profile</button>
        </form>
      </details>
    </main>
  )
}
