"use client";

import { useState } from "react";

type Message = {
  id: string;
  role: string;
  content: string;
  pending?: boolean;
};

export default function BookInsightsClient({ bookId }: { bookId: string }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  async function send() {
    if (!input.trim() || isSending) return;
    setError("");
    setIsSending(true);
    const userId = `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pendingId = `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const currentInput = input;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: currentInput },
      { id: pendingId, role: "assistant", content: "Working...", pending: true },
    ]);
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope_type: "book",
        scope_id: bookId,
        message: currentInput,
        mode: "Book insights",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err?.error || "AI request failed");
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === pendingId
            ? { ...msg, content: "AI request failed. Try again.", pending: false }
            : msg
        )
      );
      setIsSending(false);
      return;
    }

    const data = await res.json();
    const content = data?.assistantMessage?.content || "(empty)";
    setMessages((prev) =>
      prev.map((msg) => (msg.id === pendingId ? { ...msg, content, pending: false } : msg))
    );
    setInput("");
    setIsSending(false);
  }

  return (
    <div className="mt-3 grid gap-2" aria-busy={isSending}>
      <textarea
        className="min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask about the book..."
        disabled={isSending}
      />
      <button
        className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        type="button"
        onClick={send}
        disabled={isSending}
      >
        {isSending ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            Asking...
          </span>
        ) : (
          "Ask"
        )}
      </button>
      {isSending && <div className="text-xs text-slate-500">Working on it…</div>}
      {error && <div className="text-xs text-red-600">AI error: {error}</div>}
      <div className="grid gap-2 text-xs">
        {messages.map((msg, idx) => (
          <div key={msg.id || `${msg.role}-${idx}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
            <div className="font-medium">{msg.role}</div>
            <div className="whitespace-pre-line">{msg.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
