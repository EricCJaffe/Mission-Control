import Link from 'next/link'
import { supabaseServer } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await supabaseServer()
  const { data } = await supabase.auth.getUser()

  return (
    <main className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="text-sm text-muted-foreground">
          Signed in as: <span className="font-medium text-black">{data.user?.email}</span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border p-4 shadow-sm">
          <h2 className="font-semibold">Spirit</h2>
          <p className="text-sm text-muted-foreground mt-1">Mission/vision/values alignment.</p>
        </section>

        <section className="rounded-2xl border p-4 shadow-sm">
          <h2 className="font-semibold">Soul</h2>
          <p className="text-sm text-muted-foreground mt-1">Relationships, emotions, inner life.</p>
        </section>

        <section className="rounded-2xl border p-4 shadow-sm">
          <h2 className="font-semibold">Body</h2>
          <p className="text-sm text-muted-foreground mt-1">Health, energy, action capacity.</p>
        </section>
      </div>

      <div className="mt-6 flex gap-3">
        <Link className="rounded-xl border px-3 py-2 text-sm" href="/projects">
          Projects
        </Link>
        <Link className="rounded-xl border px-3 py-2 text-sm" href="/health">
          Health
        </Link>
      </div>
    </main>
  )
}
