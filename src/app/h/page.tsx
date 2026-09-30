import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentHelper, helperPage } from '@/lib/helpers/server'
import HelperList from '@/components/helpers/HelperList'

export const dynamic = 'force-dynamic'
/* Neutral title and no indexing: the tab says nothing about whose list it is. */
export const metadata: Metadata = { title: 'Work list', robots: { index: false, follow: false } }

/*
 * A helper's list. Outside the middleware on purpose: helpers have no
 * Supabase session. The cookie is checked here, and every read behind
 * helperPage is filtered to this helper's owner and to shared jobs.
 */
export default async function HelperPage() {
  const h = await currentHelper()
  if (!h) redirect('/h/login')
  const page = await helperPage(h)
  return (
    <main className="min-h-screen bg-slate-50">
      <HelperList
        name={h.worker.name}
        maintenance={page.maintenance}
        oneOff={page.oneOff}
        tracksHours={h.worker.tracks_hours}
        clock={page.clock}
        hours={page.hours}
        supplies={page.supplies}
      />
    </main>
  )
}
