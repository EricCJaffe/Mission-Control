"use client";

import { useEffect, useRef, useState } from "react";

/*
 * One click from the email: submits as soon as the page opens, once (the ref
 * guards React's double effect in development). If it fails, the button
 * retries; the endpoint refuses a second answer, so a retry can never record
 * two.
 */
export default function LinkAnswer({ id, answer, label, token }: { id: string; answer: string; label: string; token: string }) {
  const sent = useRef(false);
  const [state, setState] = useState<{ kind: "sending" } | { kind: "done" } | { kind: "error"; message: string }>({ kind: "sending" });

  async function submit() {
    setState({ kind: "sending" });
    try {
      const res = await fetch(`/api/decisions/${id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer, token }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) setState({ kind: "done" });
      else setState({ kind: "error", message: body.error ?? "Could not record the answer" });
    } catch {
      setState({ kind: "error", message: "Could not reach the server" });
    }
  }

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-700">
        Your answer: <span className="font-semibold text-slate-900">{label}</span>
      </p>
      {state.kind === "sending" && <p className="text-slate-500">Recording…</p>}
      {state.kind === "done" && <p className="font-medium text-green-700">Recorded. The bots have it within five minutes.</p>}
      {state.kind === "error" && (
        <div className="space-y-2">
          <p className="text-red-700">{state.message}</p>
          {state.message !== "Already answered" && (
            <button type="button" onClick={() => void submit()} className="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white">
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
