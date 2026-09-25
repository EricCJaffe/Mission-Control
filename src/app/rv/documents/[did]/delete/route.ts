import { supabaseServer } from '@/lib/supabase/server'
import { back, text } from '@/lib/maintenance/form'

/* The file goes with the row: an orphaned object is paid for and never seen. */
export async function POST(req: Request, ctx: { params: Promise<{ did: string }> }) {
  const { did } = await ctx.params
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return back(req, '/login')
  const form = await req.formData()
  const { data: doc } = await supabase.from('rv_documents').select('bucket,path').eq('id', did).maybeSingle()
  if (doc?.path) await supabase.storage.from(doc.bucket as string).remove([doc.path as string])
  await supabase.from('rv_documents').delete().eq('id', did)
  return back(req, text(form, 'redirect') ?? '/rv')
}
