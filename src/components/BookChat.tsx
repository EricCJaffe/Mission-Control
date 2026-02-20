"use client";

import { useState } from "react";

type ChatMessage = {
  id: string;
  role: string;
  content: string;
};

export default function BookChat({ bookId, initialMessages }: { bookId: string; initialMessages: ChatMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");

  async function send() {
    if (!input.trim()) return;
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope_type: "book",
        scope_id: bookId,
        message: input,
        mode: "Book-aware",
      }),
    });
    const data = await res.json();
    setMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
    setInput("");
  }

  return (
    <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
      <div className="text-sm font-semibold">Chat about this book</div>
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
      />
      <button className="mt-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white" onClick={send} type="button">
        Send
      </button>
    </div>
  );
}
