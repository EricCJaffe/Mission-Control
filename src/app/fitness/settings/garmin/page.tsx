'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function GarminAuthPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAuth(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/fitness/garmin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (data.success) {
        router.push('/fitness/settings');
      } else {
        setError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setError('Network error - please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="pt-4 md:pt-8 pb-24">
      <div className="max-w-lg mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold">Connect Garmin</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your Garmin Connect credentials to enable automatic sync
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="rounded-2xl border border-white/80 bg-white/70 p-6 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Garmin Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Garmin Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Connecting...' : 'Connect Garmin'}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-600">
            <strong>Privacy Note:</strong> Your credentials are encrypted and stored securely.
            We use them only to sync your health and activity data from Garmin Connect.
          </p>
        </div>

        <button
          onClick={() => router.back()}
          className="mt-4 text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to Settings
        </button>
      </div>
    </main>
  );
}
