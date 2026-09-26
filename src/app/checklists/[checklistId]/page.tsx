import { notFound } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import { getChecklist, OPS_CHECKLISTS } from '@/lib/rv/checklists'
import { checkedIds, openRun } from '@/lib/rv/runs'
import RvChecklist from '@/components/rv/RvChecklist'

export const dynamic = 'force-dynamic'

/* The RV checklist screen and its runs, pointed at the non-RV lists. */
export default async function OpsChecklistPage({ params }: { params: Promise<{ checklistId: string }> }) {
  const { checklistId } = await params
  const checklist = getChecklist(checklistId)
  if (!checklist || !OPS_CHECKLISTS.includes(checklist)) notFound()

  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const run = await openRun(supabase, userData.user.id, checklistId)
  const checked = await checkedIds(supabase, run.id)

  return (
    <main className="mx-auto max-w-2xl pt-2 md:pt-6">
      <RvChecklist
        checklist={checklist}
        initialChecked={checked}
        location={null}
        basePath="/checklists"
        back={{ href: '/checklists', label: 'Checklists' }}
      />
    </main>
  )
}
