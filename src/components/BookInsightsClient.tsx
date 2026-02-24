"use client";

import { useMemo, useState } from "react";
import { useUiFeedback } from "@/components/UiFeedbackProvider";

type Message = {
  id: string;
  role: string;
  content: string;
  thread_id?: string;
  created_at?: string;
  pending?: boolean;
};

type Thread = {
  id: string;
  created_at: string;
};

export default function BookInsightsClient({
  bookId,
  threads,
  messages,
}: {
  bookId: string;
  threads: Thread[];
  messages: Message[];
}) {
  const [input, setInput] = useState("");
  const [threadsState, setThreadsState] = useState<Thread[]>(threads || []);
  const [messagesState, setMessagesState] = useState<Message[]>(messages || []);
  const [selectedThreadId, setSelectedThreadId] = useState(threads?.[0]?.id || "");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const { startProgress, stopProgress } = useUiFeedback();

  const threadMessages = useMemo(() => {
    return messagesState.filter((msg) =>
      selectedThreadId ? msg.thread_id === selectedThreadId : !msg.thread_id
    );
  }, [messagesState, selectedThreadId]);

  async function send() {
    if (!input.trim() || isSending) return;
    setError("");
    setIsSending(true);
    startProgress();
    const userId = `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pendingId = `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const currentInput = input;
    setMessagesState((prev) => [
      ...prev,
      { id: userId, role: "user", content: currentInput, thread_id: selectedThreadId },
      { id: pendingId, role: "assistant", content: "Working...", pending: true, thread_id: selectedThreadId },
    ]);
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scope_type: "book",
        scope_id: bookId,
        message: currentInput,
        mode: "Book insights",
        thread_id: selectedThreadId || undefined,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setError(err?.error || "AI request failed");
      setMessagesState((prev) =>
        prev.map((msg) =>
          msg.id === pendingId
            ? { ...msg, content: "AI request failed. Try again.", pending: false }
            : msg
        )
      );
      setIsSending(false);
      stopProgress();
      return;
    }

    const data = await res.json();
    const threadId = data?.thread_id || selectedThreadId;
    const content = data?.assistantMessage?.content || "(empty)";
    const userMessage = data?.userMessage;
    const assistantMessage = data?.assistantMessage;
    if (threadId && !selectedThreadId) {
      setSelectedThreadId(threadId);
      if (!threadsState.find((thread) => thread.id === threadId)) {
        setThreadsState((prev) => [{ id: threadId, created_at: new Date().toISOString() }, ...prev]);
      }
    }
    setMessagesState((prev) => {
      const withoutPending = prev.filter((msg) => msg.id !== pendingId && msg.thread_id !== selectedThreadId);
      const nextMessages: Message[] = [...withoutPending];
      if (userMessage?.id) {
        nextMessages.push({
          id: userMessage.id,
          role: userMessage.role,
          content: userMessage.content,
          thread_id: threadId,
          created_at: userMessage.created_at,
        });
      }
      if (assistantMessage?.id) {
        nextMessages.push({
          id: assistantMessage.id,
          role: assistantMessage.role,
          content: assistantMessage.content,
          thread_id: threadId,
          created_at: assistantMessage.created_at,
        });
      } else {
        nextMessages.push({
          id: pendingId,
          role: "assistant",
          content,
          pending: false,
          thread_id: threadId,
        });
      }
      return nextMessages;
    });
    setInput("");
    setIsSending(false);
    stopProgress();
  }

  return (
    <div className="mt-3 grid gap-3" aria-busy={isSending}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] uppercase tracking-wide text-slate-400">Thread</label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
            value={selectedThreadId}
            onChange={(event) => setSelectedThreadId(event.target.value)}
          >
            <option value="">New thread</option>
            {threadsState.map((thread) => (
              <option key={thread.id} value={thread.id}>
                {new Date(thread.created_at).toLocaleString()}
              </option>
            ))}
          </select>
        </div>
        <button
          className="mt-4 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px]"
          type="button"
          onClick={() => setSelectedThreadId("")}
        >
          New Thread
        </button>
      </div>
      <div className="h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <div className="grid gap-2">
          {threadMessages.length === 0 && <div className="text-slate-500">No messages yet.</div>}
          {threadMessages.map((msg, idx) => (
            <div key={msg.id || `${msg.role}-${idx}`} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
              <div className="font-medium">{msg.role}</div>
              <div className="whitespace-pre-line">{msg.content}</div>
            </div>
          ))}
        </div>
      </div>
      {error && <div className="text-xs text-red-600">AI error: {error}</div>}
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
    </div>
  );
}
