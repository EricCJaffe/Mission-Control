"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "done">("loading");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    let isMounted = true;
    const supabase = supabaseBrowser();

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        setStatus("error");
        setError(error.message);
        return;
      }
      if (!data.session) {
        setStatus("error");
        setError("No active recovery session. Use the link from your email.");
        return;
      }
      setStatus("ready");
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setError(error.message);
      return;
    }

    setStatus("done");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm bg-white/60 backdrop-blur">
        <h1 className="text-2xl font-semibold">Reset Password</h1>
        <p className="mt-2 text-sm text-slate-500">
          Set a new password for your account.
        </p>

        {status === "loading" && (
          <div className="mt-4 rounded-xl border p-3 text-sm">Loading recovery session…</div>
        )}

        {status !== "loading" && (
          <form className="mt-6 space-y-3" onSubmit={submit}>
            <label className="block text-sm font-medium">New password</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
              disabled={status === "error" || status === "done"}
            />

            <label className="block text-sm font-medium">Confirm password</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              minLength={8}
              required
              disabled={status === "error" || status === "done"}
            />

            <button
              className="w-full rounded-xl bg-blue-700 text-white py-2 font-medium disabled:opacity-60"
              type="submit"
              disabled={status !== "ready"}
            >
              Update password
            </button>
          </form>
        )}

        {status === "done" && (
          <div className="mt-4 rounded-xl border p-3 text-sm">
            Password updated. You can now sign in.
          </div>
        )}

        {status === "error" && (
          <div className="mt-4 rounded-xl border p-3 text-sm text-red-700">
            Error: {error}
          </div>
        )}

        <div className="mt-4 text-sm">
          <Link className="text-blue-800" href="/login">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
