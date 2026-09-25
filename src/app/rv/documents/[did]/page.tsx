import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { renderMarkdown } from '@/lib/markdown'

export const dynamic = 'force-dynamic'

/*
 * One document. Text confirmations (the emails, saved as markdown) are read
 * from the private bucket and shown here, readable on a phone at a check-in
 * window. Anything else — a PDF, an image, a link — goes to its signed URL.
 */
export default async function RvDocumentPage({ params }: { params: Promise<{ did: string }> }) {
  const { did } = await params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const { data: doc } = await supabase
    .from('rv_documents')
    .select('id,trip_id,title,kind,bucket,path,url,mime,filename')
    .eq('id', did)
    .maybeSingle()
  if (!doc) notFound()
  const isText = doc.path && (doc.mime?.startsWith('text/') || /\.(md|txt)$/i.test(doc.path as string))
  if (!isText) redirect(`/rv/documents/${did}/open`)

  const { data: blob, error } = await supabase.storage.from(doc.bucket as string).download(doc.path as string)
  const text = blob ? await blob.text() : ''
  const back = doc.trip_id ? `/rv/trips/${doc.trip_id}?tab=reservations` : '/rv'

  return (
    <main className="mx-auto max-w-3xl pt-4 md:pt-8 pb-16">
      <Link href={back} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Trip</Link>
      <h1 className="mt-2 text-2xl font-semibold">{doc.title}</h1>
      <a href={`/rv/documents/${did}/open`} className="mt-1 inline-flex items-center gap-1 text-xs text-blue-700"><ExternalLink className="h-3 w-3" /> Raw file</a>
      {error && <p className="mt-4 text-sm text-red-700">Could not read the file: {error.message}</p>}
      {/* renderMarkdown escapes everything before it applies markup. */}
      <article
        className="mt-4 break-words text-[15px] leading-relaxed text-slate-800 [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:font-semibold [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:text-blue-700 [&_blockquote]:border-l-4 [&_blockquote]:border-yellow-300 [&_blockquote]:bg-yellow-50 [&_blockquote]:px-3 [&_table]:my-3 [&_table]:w-full [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
      />
    </main>
  )
}
