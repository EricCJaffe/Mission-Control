'use client'

import { useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function LoginPage() {
  const params = useSearchParams()
  const nextPath = params.get('next') || '/dashboard'

  const redirectTo = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`
  }, [nextPath])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string>('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('working')
    setError('')

    const supabase = supabaseBrowser()

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo },
      })
      if (error) {
        setStatus('error')
        setError(error.message)
        return
      }
      setStatus('done')
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setStatus('error')
      setError(error.message)
      return
    }

    setStatus('done')
    window.location.href = nextPath
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm bg-white/60 backdrop-blur">
        <h1 className="text-2xl font-semibold">TacPastor’s Mission Control</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === 'signin' ? 'Sign in with email + password.' : 'Create your account (email confirm).'}
        </p>

        <form className="mt-6 space-y-3" onSubmit={submit}>
          <label className="block text-sm font-medium">Email</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <label className="block text-sm font-medium">Password</label>
          <input
            className="w-full rounded-xl border px-3 py-2"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={8}
          />

          <button
            className="w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-60"
            type="submit"
            disabled={status === 'working' || !email || !password}
          >
            {status === 'working' ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>

          <button
            type="button"
            className="w-full rounded-xl border py-2 text-sm"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            Switch to {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>

          {status === 'done' && mode === 'signup' && (
            <div className="text-sm rounded-xl border p-3">
              Account created. Check your email to confirm, then come back and Sign in.
            </div>
          )}

          {status === 'done' && mode === 'signin' && (
            <div className="text-sm rounded-xl border p-3">Success. Redirecting…</div>
          )}

          {status === 'error' && (
            <div className="text-sm rounded-xl border p-3 text-red-700">
              Error: {error}
            </div>
          )}
        </form>
      </div>
    </main>
  )
}
