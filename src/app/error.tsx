'use client';

// Root error boundary: a crash in any page shows this instead of a blank screen.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
      <p style={{ marginTop: 8, color: '#475569' }}>This page hit an error.{error.digest ? ` (ref ${error.digest})` : ''}</p>
      <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
        <button onClick={() => reset()} style={{ padding: '8px 14px', border: '1px solid #94a3b8', borderRadius: 8 }}>Try again</button>
        <a href="/login" style={{ padding: '8px 14px', border: '1px solid #94a3b8', borderRadius: 8 }}>Sign in</a>
        <a href="/dashboard" style={{ padding: '8px 14px', border: '1px solid #94a3b8', borderRadius: 8 }}>Dashboard</a>
      </div>
    </div>
  );
}
