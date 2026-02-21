import { supabaseServer } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function ProjectsPage() {
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()

  const user = userData.user
  if (!user) return null

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id,title,status,priority,created_at')
    .order('created_at', { ascending: false })

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Projects</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track the active missions and keep the queue honest.
          </p>
        </div>
      </div>

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
        {(projects || []).map((p) => (
          <div key={p.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{p.title}</div>
              <div className="text-xs rounded-full border border-slate-200 bg-white px-2 py-1">
                {p.status}
              </div>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Priority: {p.priority} · Created: {new Date(p.created_at).toLocaleString()}
            </div>
          </div>
        ))}

        {projects && projects.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
            No projects yet. Add your first one above.
          </div>
        )}
      </div>
    </main>
  )
}
