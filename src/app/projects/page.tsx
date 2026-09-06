import Link from 'next/link'
import { GitBranch, AlertTriangle } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type SyncedProject = {
  /* The harvester writes this key as `project`, holding the repo's slug. */
  project: string | null
  open: number
  mine: number
  parsed: number
  files: string[]
  names_people?: boolean
}

/*
 * What the harvester saw, whether or not it imported it.
 *
 * The default filter brings in urgent items that are yours — 174 of the 1,271
 * open across eleven repos. The rest are not lost, they are counted: every run
 * writes per-repo totals into sync_runs.log. Without surfacing that here, a
 * project showing three tasks looks finished when it actually has six hundred,
 * and the single pane of glass quietly lies by omission.
 */
async function latestRollup(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
): Promise<{ bySlug: Map<string, SyncedProject>; at: string | null }> {
  const { data } = await supabase
    .from('sync_runs')
    .select('started_at, log')
    .eq('source', 'projects')
    .eq('status', 'ok')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const bySlug = new Map<string, SyncedProject>()
  const repos = (data?.log as { repos?: SyncedProject[] } | null)?.repos ?? []
  for (const repo of repos) if (repo.project) bySlug.set(repo.project, repo)
  return { bySlug, at: data?.started_at ?? null }
}

export default async function ProjectsPage() {
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()

  const user = userData.user
  if (!user) return null

  const [{ data: projects, error }, { data: taskRows }, rollup] = await Promise.all([
    supabase
      .from('projects')
      .select('id,title,status,priority,created_at,slug,domain,client,repo_path,sync_enabled,last_synced_at')
      .order('created_at', { ascending: false }),
    supabase.from('tasks').select('project_id,status,priority').not('project_id', 'is', null),
    latestRollup(supabase),
  ])

  const counts = new Map<string, { open: number; urgent: number }>()
  for (const t of taskRows ?? []) {
    if (!t.project_id) continue
    const c = counts.get(t.project_id) ?? { open: 0, urgent: 0 }
    if (t.status !== 'done') {
      c.open += 1
      if (t.priority === 1) c.urgent += 1
    }
    counts.set(t.project_id, c)
  }

  const sorted = [...(projects ?? [])].sort(
    (a, b) => (counts.get(b.id)?.open ?? 0) - (counts.get(a.id)?.open ?? 0),
  )

  const totalTracked = [...counts.values()].reduce((s, c) => s + c.open, 0)
  const totalOpenInRepos = [...rollup.bySlug.values()].reduce((s, r) => s + (r.open ?? 0), 0)

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Projects</h1>
        <p className="text-sm text-slate-500 mt-1">
          Track the active missions and keep the queue honest.
        </p>
      </div>

      {totalOpenInRepos > 0 && (
        <div className="mt-4 rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">
            <span className="font-semibold tabular-nums">{totalTracked}</span> tasks tracked here, out of{' '}
            <span className="font-semibold tabular-nums">{totalOpenInRepos}</span> open across the repos.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            The sync imports what is urgent and yours. The rest is counted, not imported — the
            numbers below are what each project actually holds.
            {rollup.at && ` Last read ${new Date(rollup.at).toLocaleString()}.`}
          </p>
        </div>
      )}

      <form className="mt-6 flex flex-col gap-2 sm:flex-row" action="/projects/new" method="post">
        <input
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          name="title"
          placeholder="New project title…"
          required
        />
        <button className="rounded-xl bg-blue-700 text-white px-4 py-2 text-sm font-medium shadow-sm" type="submit">
          Add
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading projects: {error.message}
        </div>
      )}

      <div className="mt-6 grid gap-3">
        {sorted.map((p) => {
          const c = counts.get(p.id) ?? { open: 0, urgent: 0 }
          const repo = p.slug ? rollup.bySlug.get(p.slug) : undefined
          const notImported = repo ? Math.max(0, (repo.open ?? 0) - c.open) : 0

          return (
            <div key={p.id} className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {p.slug && <GitBranch className="h-4 w-4 text-slate-400" />}
                  <span className="font-semibold">{p.title}</span>
                  {p.client && <span className="text-xs text-slate-500">· {p.client}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {c.urgent > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 font-medium text-red-700">
                      <AlertTriangle className="h-3 w-3" />
                      {c.urgent} urgent
                    </span>
                  )}
                  <Link
                    href={`/tasks?project=${p.id}`}
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
                  >
                    {c.open} open
                  </Link>
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-1">{p.status}</span>
                </div>
              </div>

              {repo && (
                <div className="mt-2 text-xs text-slate-500">
                  {repo.open} open in the repo
                  {notImported > 0 && (
                    <>
                      {' · '}
                      <span className="text-slate-600">{notImported} not imported</span>
                      {repo.names_people === false && ' (this repo names no assignees)'}
                    </>
                  )}
                  {repo.files?.length > 0 && (
                    <>
                      {' · '}
                      <span className="text-slate-400">{repo.files.join(', ')}</span>
                    </>
                  )}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {p.domain && <span className="rounded-full bg-slate-100 px-2 py-0.5">{p.domain}</span>}
                {p.repo_path && <span className="font-mono text-[11px]">{p.repo_path}</span>}
                {p.sync_enabled === false && <span className="text-amber-700">sync disabled</span>}
                {p.last_synced_at && <span>synced {new Date(p.last_synced_at).toLocaleString()}</span>}
                {!p.slug && <span className="text-slate-400">not linked to a repo</span>}
              </div>
            </div>
          )
        })}

        {projects && projects.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
            No projects yet. Add your first one above.
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-slate-500">
        Projects with a{' '}
        <GitBranch className="inline h-3 w-3 text-slate-400" /> are synced from <code>~/dev</code>.{' '}
        <Link className="text-blue-700 hover:underline" href="/sync">
          Sync health
        </Link>
      </p>
    </main>
  )
}
