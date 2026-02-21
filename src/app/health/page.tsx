import { supabase } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

export default async function HealthPage() {
  const start = Date.now()

  const { data, error } = await supabase.auth.getSession()

  const ms = Date.now() - start

  return (
    <main className="pt-4 md:pt-8">
      <h1 className="text-3xl font-semibold">Health</h1>
      <p className="mt-2 text-sm text-slate-500">Connectivity check for Supabase auth.</p>

      <div className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm">
        <div className="text-sm">
          <div><span className="font-semibold">Supabase URL:</span> {process.env.NEXT_PUBLIC_SUPABASE_URL}</div>
          <div className="mt-1"><span className="font-semibold">Latency:</span> {ms} ms</div>
        </div>

        <div className="mt-4 text-sm">
          <span className="font-semibold">Status:</span>{' '}
          {error ? (
            <span className="text-red-600">ERROR — {error.message}</span>
          ) : (
            <span className="text-blue-700">OK</span>
          )}
        </div>

        <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-100 p-4 text-xs">
{JSON.stringify({ session: data?.session ? 'present' : 'none' }, null, 2)}
        </pre>
      </div>
    </main>
  )
}
