import { supabase } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

export default async function HealthPage() {
  const start = Date.now()

  const { data, error } = await supabase.auth.getSession()

  const ms = Date.now() - start

  return (
    <main style={{ padding: 24, fontFamily: 'ui-sans-serif, system-ui' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Mission Control — Health</h1>

      <div style={{ marginTop: 16, padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
        <div><b>Supabase URL:</b> {process.env.NEXT_PUBLIC_SUPABASE_URL}</div>
        <div><b>Latency:</b> {ms} ms</div>
        <div style={{ marginTop: 12 }}>
          <b>Status:</b>{' '}
          {error ? (
            <span style={{ color: 'crimson' }}>ERROR — {error.message}</span>
          ) : (
            <span style={{ color: 'green' }}>OK</span>
          )}
        </div>

        <pre style={{ marginTop: 12, background: '#f7f7f7', padding: 12, borderRadius: 12, overflowX: 'auto' }}>
{JSON.stringify({ session: data?.session ? 'present' : 'none' }, null, 2)}
        </pre>
      </div>
    </main>
  )
}
