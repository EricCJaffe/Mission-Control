import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'

const MAX_BYTES = 25 * 1024 * 1024

/*
 * A document is a file in the private `attachments` bucket, under the owner's
 * own folder (the bucket's policy only lets a user touch `<their id>/...`), or
 * a link. Never a public URL: these are confirmations with names, addresses
 * and reference numbers on them.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const here = `/rv/trips/${id}?tab=documents`
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')

  const form = await req.formData()
  const file = form.get('file')
  const url = text(form, 'url')
  const hasFile = file instanceof File && file.size > 0
  const title = text(form, 'title') ?? (hasFile ? (file as File).name : null)
  if (!title || (!hasFile && !url)) return back(req, withError(here, 'Attach a file or paste a link, and give it a title.'))

  let path: string | null = null
  let meta: { filename: string; mime: string | null; bytes: number } | null = null
  if (hasFile) {
    const f = file as File
    if (f.size > MAX_BYTES) return back(req, withError(here, 'That file is over 25 MB.'))
    const safe = f.name.replace(/[^\w.\-]+/g, '_').slice(-120)
    path = `${user.id}/rv/${id}/${crypto.randomUUID()}-${safe}`
    const { error } = await supabase.storage.from('attachments').upload(path, f, { contentType: f.type || undefined, upsert: false })
    if (error) return back(req, withError(here, `Upload failed: ${error.message}`))
    meta = { filename: f.name, mime: f.type || null, bytes: f.size }
  }

  const { error } = await supabase.from('rv_documents').insert({
    user_id: user.id, trip_id: id, title, kind: text(form, 'kind'), path, url: hasFile ? null : url,
    filename: meta?.filename ?? null, mime: meta?.mime ?? null, bytes: meta?.bytes ?? null, source_note: text(form, 'source_note'),
  })
  if (error) {
    if (path) await supabase.storage.from('attachments').remove([path])
    return back(req, withError(here, error.message))
  }
  return back(req, here)
}
