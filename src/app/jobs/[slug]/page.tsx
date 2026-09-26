import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { publicPosting } from '@/lib/jobs/postings'
import ApplyForm from '@/components/jobs/ApplyForm'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await publicPosting((await params).slug)
  return { title: p ? `${p.title}: apply` : 'Job', description: p?.summary ?? undefined, robots: { index: false, follow: false } }
}

/*
 * A public job page. Outside the middleware on purpose: strangers open it
 * from a Facebook post, on a phone, with no account. It renders one posting
 * and the form, and links nowhere else in the app.
 */
export default async function JobPage({ params }: Props) {
  const p = await publicPosting((await params).slug)
  if (!p) notFound()
  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-xl px-4 pb-16 pt-6">
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        {p.location && <p className="mt-1 text-sm text-slate-600">{p.location}</p>}
        {p.summary && <p className="mt-4 text-[15px] text-slate-800">{p.summary}</p>}

        <div className="mt-5 rounded-2xl border-2 border-slate-200 bg-white p-4">
          <h2 className="font-semibold">The work</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-slate-800">
            {p.duties.map((d) => <li key={d}>{d}</li>)}
          </ul>
          {p.schedule && <p className="mt-3 text-[15px]"><span className="font-semibold">Hours:</span> {p.schedule}</p>}
          {p.pay && <p className="mt-1 text-[15px]"><span className="font-semibold">Pay:</span> {p.pay}</p>}
          {p.requirements.length > 0 && (
            <>
              <h2 className="mt-4 font-semibold">You’ll need</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-slate-800">
                {p.requirements.map((r) => <li key={r}>{r}</li>)}
              </ul>
            </>
          )}
          {p.contact_phone && (
            <p className="mt-4 text-[15px]">
              Questions? Call or text <a className="font-medium text-blue-700" href={`tel:${p.contact_phone.replace(/[^\d+]/g, '')}`}>{p.contact_phone}</a>
            </p>
          )}
        </div>

        <ApplyForm slug={p.slug} />
      </div>
    </main>
  )
}
