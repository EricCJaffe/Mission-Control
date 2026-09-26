import Link from 'next/link'
import { owner, properties, JOBS_PROJECT } from '@/lib/helpers/owner'
import { serviceClient } from '@/lib/helpers/server'
import { addDays, type WorkRow } from '@/lib/helpers/list'
import { today } from '@/lib/day'
import HelpersAdmin, { type AdminData } from '@/components/helpers/HelpersAdmin'

export const dynamic = 'force-dynamic'

/*
 * Eric's side of the helper list: what is shared and how it reads, who can
 * sign in, and the hours they logged. Everything here is his own data under
 * RLS, except the login rows, which only the service role may read.
 */
export default async function HelpersPage() {
  const o = await owner()
  if (!o) return null
  const { db, userId } = o
  const t = today()

  const [{ data: items }, { data: workers }, props, { data: projects }, { data: time }, { data: done }] = await Promise.all([
    db.from('work_items').select('*'),
    db.from('workers').select('id,name,phone,email,skills,tracks_hours,hourly_rate,notes,active').order('name'),
    properties(db),
    db.from('projects').select('id,slug').in('slug', ['home-maintenance', JOBS_PROJECT.slug]),
    db.from('work_time').select('id,task_title,worker_id,started_at,ended_at').gte('started_at', addDays(t, -31)).order('started_at', { ascending: false }),
    db.from('work_completions').select('id,task_title,worker_id,completed_at,note').order('completed_at', { ascending: false }).limit(25),
  ])

  const itemByTask = new Map((items ?? []).map((i) => [i.task_id as string, i]))
  const projectIds = (projects ?? []).map((p) => p.id as string)
  const [{ data: sharedTasks }, { data: candidates }] = await Promise.all([
    itemByTask.size
      ? db.from('tasks').select('id,title,status,due_date,recurrence_rule,created_at').in('id', [...itemByTask.keys()])
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    projectIds.length
      ? db
          .from('tasks')
          .select('id,title,due_date,recurrence_rule')
          .in('project_id', projectIds)
          .neq('status', 'done')
          .or(`due_date.is.null,due_date.lte.${addDays(t, 60)}`)
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(80)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])

  const rows: WorkRow[] = (sharedTasks ?? []).map((task) => {
    const i = itemByTask.get(task.id as string)!
    return {
      task_id: task.id, title: task.title, status: task.status, due_date: task.due_date, recurrence_rule: task.recurrence_rule, created_at: task.created_at,
      shared: i.shared, skill: i.skill, location_label: i.location_label, pinned: i.pinned, sort_order: i.sort_order,
      assignee_worker_id: i.assignee_worker_id, assignee_name: i.assignee_name, instructions: i.instructions, materials: i.materials,
      gift_card_note: i.gift_card_note, gift_card_sent_at: i.gift_card_sent_at, claimed_at: i.claimed_at,
    } as WorkRow
  })

  // Login rows: service role, filtered to Eric's own workers. Never the hash.
  const { data: accounts } = await serviceClient()
    .from('helper_accounts')
    .select('worker_id,email,disabled_at,last_login_at')
    .eq('user_id', userId)

  const data: AdminData = {
    today: t,
    rows,
    locationIds: Object.fromEntries((items ?? []).map((i) => [i.task_id as string, (i.location_asset_id as string | null) ?? null])),
    candidates: ((candidates ?? []) as Array<{ id: string; title: string; due_date: string | null; recurrence_rule: string | null }>).filter(
      (c) => !itemByTask.get(c.id)?.shared,
    ),
    workers: (workers ?? []) as AdminData['workers'],
    accounts: (accounts ?? []) as AdminData['accounts'],
    properties: props,
    time: (time ?? []) as AdminData['time'],
    completions: (done ?? []) as AdminData['completions'],
  }

  return (
    <main className="pt-4 pb-16 md:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Helpers</h1>
          <p className="mt-1 text-sm text-slate-500">
            Jobs you share, the people who can sign in to see them, and their hours. Helpers sign in at <span className="font-mono">/h</span> and see this list and nothing else.
          </p>
        </div>
        <Link href="/helpers/preview" className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700">
          See what they see
        </Link>
      </div>
      <HelpersAdmin data={data} />
    </main>
  )
}
