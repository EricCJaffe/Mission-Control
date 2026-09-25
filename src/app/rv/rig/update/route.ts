import { supabaseServer } from '@/lib/supabase/server'
import { back, text, withError } from '@/lib/maintenance/form'

/*
 * The rig profile is one JSON document. Editing it as JSON is blunt, but it is
 * edited rarely, by one person, and a form per field would be a second copy of
 * the shape to keep in step with the pack it came from.
 */
export async function POST(req: Request) {
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  const user = userData.user
  if (!user) return back(req, '/login')
  const raw = text(await req.formData(), 'data')
  let data: unknown
  try {
    data = JSON.parse(raw ?? '')
  } catch (e) {
    return back(req, withError('/rv/rig?edit=1', `Not valid JSON: ${(e as Error).message}`))
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return back(req, withError('/rv/rig?edit=1', 'The profile must be a JSON object.'))
  const { error } = await supabase.from('rv_profile').upsert({ user_id: user.id, data, updated_at: new Date().toISOString() })
  if (error) return back(req, withError('/rv/rig?edit=1', error.message))
  return back(req, '/rv/rig')
}
