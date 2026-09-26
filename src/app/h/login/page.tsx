'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

/* Helper sign-in: email and password, nothing else. Not the Mission Control login. */
export default function HelperLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/h/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setBusy(false)
    if (res.ok) {
      router.push('/h')
      router.refresh()
    } else {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not sign in.')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Work list</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in with the email and password Eric gave you.</p>
        <label className="mt-4 block text-sm font-medium">
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base" />
        </label>
        <label className="mt-3 block text-sm font-medium">
          Password
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base" />
        </label>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="mt-4 min-h-[48px] w-full rounded-xl bg-blue-700 font-medium text-white disabled:opacity-60">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
