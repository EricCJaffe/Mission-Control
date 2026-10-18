'use client';

// Last-resort boundary for errors in the root layout itself.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Mission Control hit an error</h1>
        <p style={{ marginTop: 8 }}>{error.digest ? `Ref ${error.digest}. ` : ''}Try again, or <a href="/login">sign in</a>.</p>
        <button onClick={() => reset()} style={{ marginTop: 16, padding: '8px 14px' }}>Try again</button>
      </body>
    </html>
  );
}
