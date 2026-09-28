import Link from 'next/link'
import { Package } from 'lucide-react'
import { owner } from '@/lib/helpers/owner'
import { loadList } from '@/lib/supplies-load'
import SuppliesBoard from '@/components/maintenance/SuppliesBoard'

export const dynamic = 'force-dynamic'

/*
 * Supplies: the consumables and small parts maintenance runs on, and the
 * shopping list, by store, that keeps them in stock. The list is derived on
 * every load (src/lib/supplies.ts); nothing here is a list somebody keeps.
 */
export default async function SuppliesPage() {
  const o = await owner()
  if (!o) return null
  const [{ supplies, list }, { data: assets }] = await Promise.all([
    loadList(o.db, o.userId),
    o.db.from('maintenance_assets').select('id,name').neq('status', 'retired').order('name'),
  ])

  return (
    <main className="pt-4 pb-16 md:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold">
            <Package className="h-7 w-7 text-orange-600" />
            Supplies
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            What we keep on hand for maintenance, and what to buy. Something goes on the list when it drops below its
            keep-at-least level, when someone flags it, or when a job due in the next 30 days needs more than we have.
            Finishing a job takes its supplies off the shelf.
          </p>
        </div>
        <Link href="/maintenance" className="text-sm font-medium text-blue-700 hover:underline">
          ← Maintenance
        </Link>
      </div>
      <SuppliesBoard supplies={supplies} list={list} assets={(assets ?? []) as Array<{ id: string; name: string }>} />
    </main>
  )
}
