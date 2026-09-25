import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getGuide } from '@/lib/rv/guides'
import { renderMarkdown } from '@/lib/markdown'

/* renderMarkdown escapes everything before applying markup, so this is safe. */
export default async function RvGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const guide = getGuide(id)
  if (!guide) notFound()
  return (
    <main className="mx-auto max-w-3xl pt-4 md:pt-8 pb-16">
      <Link href="/rv/guides" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Guides</Link>
      <h1 className="mt-2 text-2xl font-semibold">{guide.title}</h1>
      {guide.linkedFrom && <p className="mt-1 text-xs text-slate-500">Used in: {guide.linkedFrom}</p>}
      <article
        className="mt-4 text-[15px] leading-relaxed text-slate-800 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-blue-700 [&_table]:my-3 [&_table]:w-full [&_table]:text-sm [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1 [&_li]:my-0.5"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(guide.body) }}
      />
    </main>
  )
}
