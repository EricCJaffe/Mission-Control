import Link from 'next/link'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { GUIDES } from '@/lib/rv/guides'

/* The SOP library. Content in src/lib/rv/guides-content.ts. */
export default async function RvGuidesPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const q = ((searchParams ? await searchParams : undefined)?.q ?? '').trim().toLowerCase()
  const list = q ? GUIDES.filter((g) => `${g.title} ${g.body}`.toLowerCase().includes(q)) : GUIDES
  return (
    <main className="pt-4 md:pt-8 pb-16">
      <Link href="/rv" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> RV</Link>
      <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold"><BookOpen className="h-7 w-7 text-sky-600" /> Guides</h1>
      <form className="mt-4" action="/rv/guides">
        <input name="q" defaultValue={q} placeholder="Search — black tank, fault 45, valves" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
      </form>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {list.map((g) => (
          <Link key={g.id} href={`/rv/guides/${g.id}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-blue-300">
            <div className="font-medium">{g.title}</div>
            {g.linkedFrom && <div className="text-xs text-slate-500">Used in: {g.linkedFrom}</div>}
          </Link>
        ))}
        {list.length === 0 && <p className="text-sm text-slate-500">No guide mentions that.</p>}
      </div>
    </main>
  )
}
