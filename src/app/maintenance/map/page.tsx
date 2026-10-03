import Link from 'next/link'
import { Map as MapIcon } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { today } from '@/lib/day'
import { ASSET_COLUMNS, loadPlans, worst, type AssetRow } from '@/lib/maintenance/load'
import { dueLabel } from '@/lib/maintenance/status'
import PropertyMap, { type MapPin } from '@/components/maintenance/PropertyMap'

export const dynamic = 'force-dynamic'

/*
 * The property, from above, with every building pinned.
 *
 * A pin is a maintenance asset with a position (see
 * 20261003181117_property_map.sql), so clicking the gun range or the chicken
 * coop lands on its schedules, issues and history, and a pin is colored by the
 * worst of what that building needs: red overdue, yellow due within two weeks.
 *
 * The photo is in private storage and reaches the browser as a ten-minute
 * signed link, issued per page load and never stored.
 */
export default async function PropertyMapPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>
}) {
  const sp = searchParams ? await searchParams : undefined
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const { data: map } = await supabase.from('property_maps').select('image_path,address').maybeSingle()
  let imageUrl: string | null = null
  if (map?.image_path) {
    const { data } = await supabase.storage.from('attachments').createSignedUrl(map.image_path as string, 60 * 10)
    imageUrl = data?.signedUrl ?? null
  }

  const { data } = await supabase
    .from('maintenance_assets')
    .select(`${ASSET_COLUMNS},map_x,map_y`)
    .neq('status', 'retired')
    .order('name')
  const assets = (data ?? []) as Array<AssetRow & { map_x: number | null; map_y: number | null }>
  const plans = await loadPlans(supabase, assets, today())

  const pins: MapPin[] = assets.map((a) => {
    const own = plans.filter((p) => p.asset_id === a.id)
    const next = own[0]
    return {
      id: a.id,
      name: a.name,
      x: a.map_x,
      y: a.map_y,
      verdict: own.length ? worst(own.map((p) => p.verdict)) : null,
      next: next ? `${next.task.title.replace(`${a.name}: `, '')} · ${dueLabel(next.days)}` : null,
      schedules: own.length,
    }
  })

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold">
            <MapIcon className="h-7 w-7 text-orange-600" />
            Property map
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {map?.address ? `${map.address} · ` : ''}Every building, pinned once. Each pin is a maintenance item: tap it
            for its schedules and issues.
          </p>
        </div>
        <Link href="/maintenance" className="text-sm font-medium text-blue-700 hover:underline">
          ← Maintenance
        </Link>
      </div>

      {sp?.error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sp.error}</div>
      )}

      <div className="mt-6">
        <PropertyMap imageUrl={imageUrl} pins={pins} />
      </div>

      <details className="mt-8 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm" open={!imageUrl}>
        <summary className="cursor-pointer font-semibold">{imageUrl ? 'Replace the aerial photo' : 'Add an aerial photo'}</summary>
        <p className="mt-2 text-sm text-slate-600">
          A screenshot of the satellite view works. Pins are stored as a share of the picture, so a new photo with the
          same framing keeps them on their buildings.
        </p>
        <form action="/maintenance/map/upload" method="post" encType="multipart/form-data" className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="file" name="file" accept="image/*" required className="text-sm" />
          <input name="address" defaultValue={(map?.address as string) ?? ''} placeholder="Address (optional)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          <div className="sm:col-span-2">
            <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
              Upload
            </button>
          </div>
        </form>
      </details>
    </main>
  )
}
