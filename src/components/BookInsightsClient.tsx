"use client";

import { useState } from "react";

type Message = {
  role: string;
  content: string;
};

export default function BookInsightsClient({ bookId }: { bookId: string }) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");

  async function send() {
    if (!input.trim()) return;
    setError("");
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope_type: "book",
        scope_id: bookId,
        message: input,
        mode: "Book insights",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err?.error || "AI request failed");
      return;
    }

    const data = await res.json();
    if (data?.assistantMessage?.content) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: input },
        { role: "assistant", content: data.assistantMessage.content },
      ]);
    }
    setInput("");
  }

  return (
    <div className="mt-3 grid gap-2">
      <textarea
        className="min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask about the book..."
      />
      <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="button" onClick={send}>
        Ask
      </button>
      {error && <div className="text-xs text-red-600">AI error: {error}</div>}
      <div className="grid gap-2 text-xs">
        {messages.map((msg, idx) => (
          <div key={`${msg.role}-${idx}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
            <div className="font-medium">{msg.role}</div>
            <div className="whitespace-pre-line">{msg.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
