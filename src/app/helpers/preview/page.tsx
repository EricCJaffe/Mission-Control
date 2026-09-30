import Link from 'next/link'
import { owner } from '@/lib/helpers/owner'
import { sharedRows, workerNames } from '@/lib/helpers/server'
import { helperView } from '@/lib/helpers/list'
import { today } from '@/lib/day'
import { helperSupplies } from '@/lib/supplies-load'
import HelperList from '@/components/helpers/HelperList'

export const dynamic = 'force-dynamic'

/*
 * "See what they see": the helper screen, rendered from the same helperView
 * the helper's own page uses, for one person or for everyone. Buttons inert.
 */
export default async function HelperPreview({ searchParams }: { searchParams: Promise<{ worker?: string }> }) {
  const o = await owner()
  if (!o) return null
  const { worker: workerId } = await searchParams
  const [{ data: workers }, rows, names] = await Promise.all([
    o.db.from('workers').select('id,name,skills,tracks_hours').eq('active', true).order('name'),
    sharedRows(o.db, o.userId),
    workerNames(o.db, o.userId),
  ])
  const w = (workers ?? []).find((x) => x.id === workerId) as { id: string; name: string; skills: string[]; tracks_hours: boolean } | undefined
  const view = helperView(rows, w ? { worker_id: w.id, skills: w.skills } : { worker_id: null, skills: null }, names, today())
  const supplies = await helperSupplies(o.db, o.userId, [...view.maintenance, ...view.oneOff].map((i) => i.id))

  return (
    <main className="pt-4 pb-16 md:pt-8">
      <Link href="/helpers" className="text-sm text-slate-500">← Helpers</Link>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/helpers/preview" className={`rounded-full border px-3 py-1 text-sm ${!w ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300'}`}>
          Everything shared
        </Link>
        {(workers ?? []).map((x) => (
          <Link key={x.id} href={`/helpers/preview?worker=${x.id}`} className={`rounded-full border px-3 py-1 text-sm ${w?.id === x.id ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-300'}`}>
            {x.name}
          </Link>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50">
        <HelperList name={w?.name ?? 'a helper with every skill'} maintenance={view.maintenance} oneOff={view.oneOff} tracksHours={w?.tracks_hours ?? false} clock={null} hours={[]} supplies={supplies} preview />
      </div>
    </main>
  )
}
