import Link from 'next/link'
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
    <main className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link className="rounded-xl border px-3 py-2 text-sm" href="/dashboard">
          Dashboard
        </Link>
      </div>

      <form className="mt-6 flex gap-2" action="/projects/new" method="post">
        <input
          className="flex-1 rounded-xl border px-3 py-2"
          name="title"
          placeholder="New project title…"
          required
        />
        <button className="rounded-xl bg-black text-white px-4 py-2 text-sm font-medium" type="submit">
          Add
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border p-3 text-sm text-red-700">
          Error loading projects: {error.message}
        </div>
      )}

      <div className="mt-6 grid gap-3">
        {(projects || []).map((p) => (
          <div key={p.id} className="rounded-2xl border p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{p.title}</div>
              <div className="text-xs rounded-full border px-2 py-1">{p.status}</div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Priority: {p.priority} · Created: {new Date(p.created_at).toLocaleString()}
            </div>
          </div>
        ))}

        {projects && projects.length === 0 && (
          <div className="rounded-2xl border p-6 text-sm text-muted-foreground">
            No projects yet. Add your first one above.
          </div>
        )}
      </div>
    </main>
  )
}
