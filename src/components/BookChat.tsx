"use client";

import { useState } from "react";
import { useUiFeedback } from "@/components/UiFeedbackProvider";

type ChatMessage = {
  id: string;
  role: string;
  content: string;
};

export default function BookChat({ bookId, initialMessages }: { bookId: string; initialMessages: ChatMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { startProgress, stopProgress } = useUiFeedback();

  async function send() {
    if (!input.trim() || isSending) return;
    setError("");
    setIsSending(true);
    startProgress();
    const userId = `local-user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pendingId = `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const currentInput = input;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: currentInput },
      { id: pendingId, role: "assistant", content: "Working..." },
    ]);
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope_type: "book",
        scope_id: bookId,
        message: currentInput,
        mode: "Book-aware",
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err?.error || "AI request failed");
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === pendingId ? { ...msg, content: "AI request failed. Try again." } : msg
        )
      );
      setIsSending(false);
      stopProgress();
      return;
    }
    const data = await res.json();
    const content = data?.assistantMessage?.content || "(empty)";
    setMessages((prev) =>
      prev.map((msg) => (msg.id === pendingId ? { ...msg, content } : msg))
    );
    setInput("");
    setIsSending(false);
    stopProgress();
  }

  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm" aria-busy={isSending}>
      <div className="text-sm font-semibold">Chat about this book</div>
      {error && <div className="mt-2 text-xs text-red-600">AI error: {error}</div>}
      <div className="mt-2 grid gap-2 text-xs">
        {messages.map((msg) => (
          <div key={msg.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
            <div className="font-medium">{msg.role}</div>
            <div className="whitespace-pre-line">{msg.content}</div>
          </div>
        ))}
        {messages.length === 0 && <div className="text-xs text-slate-500">No messages yet.</div>}
      </div>
      <textarea
        className="mt-3 min-h-[80px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask about the book..."
        disabled={isSending}
      />
      <button
        className="mt-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        onClick={send}
        type="button"
        disabled={isSending}
      >
        {isSending ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
            Sending...
          </span>
        ) : (
          "Send"
        )}
      </button>
      {isSending && <div className="mt-1 text-xs text-slate-500">Working on it…</div>}
    </div>
  );
}
