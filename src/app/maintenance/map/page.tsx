import Link from 'next/link'
import { Map as MapIcon } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { today } from '@/lib/day'
import { ASSET_COLUMNS, loadPlans, type AssetRow } from '@/lib/maintenance/load'
import { loadPropertyMap } from '@/lib/maintenance/map'
import PropertyMap from '@/components/maintenance/PropertyMap'

export const dynamic = 'force-dynamic'

/*
 * The property, from above, with every building pinned.
 *
 * A pin is a maintenance asset with a position (see
 * 20261003181117_property_map.sql), so clicking the gun range or the chicken
 * coop lands on its schedules, issues and history, and a pin is colored by the
 * worst of what that building and everything in it needs: red overdue, yellow
 * due within two weeks. /maintenance shows the same map as its header.
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

  const { data } = await supabase
    .from('maintenance_assets')
    .select(ASSET_COLUMNS)
    .neq('status', 'retired')
    .order('name')
  const assets = (data ?? []) as AssetRow[]
  const plans = await loadPlans(supabase, assets, today())
  const { imageUrl, address, pins } = await loadPropertyMap(supabase, assets, plans)

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold">
            <MapIcon className="h-7 w-7 text-orange-600" />
            Property map
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {address ? `${address} · ` : ''}Every building, pinned once. Each pin is a maintenance item: tap it
            for its schedules and what is inside it.
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

      <details className="mx-auto mt-8 max-w-3xl rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm" open={!imageUrl}>
        <summary className="cursor-pointer font-semibold">{imageUrl ? 'Replace the aerial photo' : 'Add an aerial photo'}</summary>
        <p className="mt-2 text-sm text-slate-600">
          A screenshot of the satellite view works. Pins are stored as a share of the picture, so a new photo with the
          same framing keeps them on their buildings.
        </p>
        <form action="/maintenance/map/upload" method="post" encType="multipart/form-data" className="mt-3 grid gap-3 sm:grid-cols-2">
          <input type="file" name="file" accept="image/*" required className="text-sm" />
          <input name="address" defaultValue={address ?? ''} placeholder="Address (optional)" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
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
