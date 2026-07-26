"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, Dumbbell, Check, AlertTriangle } from "lucide-react";

/** Mirrors ParsedWorkout from @/lib/fitness/workout-text-parser. */
type ParsedSet = {
  set_number: number;
  set_type: string;
  reps: number | null;
  weight_lbs: number | null;
  rpe: number | null;
  notes: string | null;
};
type ParsedExercise = {
  raw_name: string;
  exercise_id: string | null;
  matched_name: string | null;
  match_confidence: number;
  candidates: Array<{ id: string; name: string; similarity: number }>;
  sets: ParsedSet[];
};
type ParsedWorkout = {
  workout_type: string;
  workout_date: string | null;
  duration_minutes: number | null;
  rpe_session: number | null;
  notes: string | null;
  exercises: ParsedExercise[];
  warnings: string[];
};

type Message = {
  role: "user" | "assistant";
  content: string;
  /** Present on workout-logging replies; renders a confirmable preview. */
  workout?: ParsedWorkout;
  savedWorkoutId?: string;
};

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // When on, the composer logs a workout instead of chatting. An explicit mode
  // rather than intent-detection: guessing wrong would either spend a parse call
  // on a normal question or answer a workout as prose and log nothing.
  const [logMode, setLogMode] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    if (logMode) {
      await handleLogWorkout(text);
      return;
    }

    const userMsg: Message = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Error ${res.status}`);
      }

      // Stream the response
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantContent += decoder.decode(value, { stream: true });
        const current = assistantContent;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: current,
          };
          return updated;
        });
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMessage}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /** Parses only — writes nothing until the preview below is confirmed. */
  async function handleLogWorkout(text: string) {
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/fitness/workouts/log-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "Here's what I read. Check it and confirm to log it.",
            workout: data.parsed as ParsedWorkout,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Couldn't read that: ${data.error}` },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error — could not read that workout." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  /** Writes the confirmed preview. No AI call, so corrections are free. */
  async function handleConfirmWorkout(index: number) {
    const parsed = messages[index]?.workout;
    if (!parsed) return;
    setSavingIndex(index);
    try {
      const res = await fetch("/api/fitness/workouts/log-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsed, confirm: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            content: `Logged — ${data.sets_created} sets saved to your history.`,
            workout: undefined,
            savedWorkoutId: data.workout?.id,
          };
          return updated;
        });
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Couldn't save: ${data.error}` },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Network error — could not save workout." },
      ]);
    } finally {
      setSavingIndex(null);
    }
  }

  /** Resolve an unmatched exercise in place — no re-parse, no extra tokens. */
  function pickCandidate(msgIndex: number, exIndex: number, candidateId: string) {
    setMessages((prev) => {
      const updated = [...prev];
      const wk = updated[msgIndex]?.workout;
      if (!wk) return prev;
      const exercises = wk.exercises.map((ex, i) => {
        if (i !== exIndex) return ex;
        const chosen = ex.candidates.find((c) => c.id === candidateId);
        return chosen
          ? { ...ex, exercise_id: chosen.id, matched_name: chosen.name, match_confidence: 1 }
          : ex;
      });
      updated[msgIndex] = { ...updated[msgIndex], workout: { ...wk, exercises } };
      return updated;
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-slate-800 text-white shadow-lg transition-transform hover:scale-105 hover:bg-slate-700 active:scale-95"
          aria-label="Open chat"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[min(600px,calc(100vh-40px))] w-[min(420px,calc(100vw-40px))] flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl border-b border-slate-100 bg-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-white" />
              <span className="text-sm font-semibold text-white">
                Mission Control AI
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-300 transition-colors hover:text-white"
              aria-label="Close chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center">
                <p className="text-center text-sm text-slate-400">
                  Ask me anything about your health, fitness, training, or
                  mission. I have your full context loaded. Tap the dumbbell to
                  log a workout by describing it.
                </p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`mb-3 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-slate-800 text-white"
                      : "border-2 border-slate-300 bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {/* Confirmable workout preview. Nothing is written until the
                      Log button below is pressed. */}
                  {msg.workout && (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                        <span className="capitalize">{msg.workout.workout_type}</span>
                        {msg.workout.duration_minutes != null && (
                          <span>{msg.workout.duration_minutes} min</span>
                        )}
                        {msg.workout.rpe_session != null && (
                          <span>RPE {msg.workout.rpe_session}</span>
                        )}
                      </div>

                      {msg.workout.warnings.map((w, wi) => (
                        <p
                          key={wi}
                          className="flex items-start gap-1 rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
                        >
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          {w}
                        </p>
                      ))}

                      {msg.workout.exercises.map((ex, ei) => (
                        <div key={ei} className="rounded-lg border border-slate-200 bg-white p-2">
                          <p className="text-xs font-medium text-slate-800">
                            {ex.matched_name ?? ex.raw_name}
                          </p>
                          {!ex.exercise_id && (
                            <div className="mt-1">
                              {ex.candidates.length > 0 ? (
                                <select
                                  defaultValue=""
                                  onChange={(e) =>
                                    e.target.value && pickCandidate(i, ei, e.target.value)
                                  }
                                  className="w-full rounded border border-amber-300 px-1.5 py-1 text-[11px]"
                                >
                                  <option value="" disabled>
                                    Which exercise did you mean?
                                  </option>
                                  {ex.candidates.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} ({Math.round(c.similarity * 100)}%)
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <p className="text-[11px] text-amber-700">
                                  Not in your library — add it first.
                                </p>
                              )}
                            </div>
                          )}
                          <div className="mt-1 space-y-0.5">
                            {ex.sets.map((st, si) => (
                              <p key={si} className="text-[11px] text-slate-600">
                                Set {si + 1}: {st.reps ?? "—"} reps
                                {st.weight_lbs != null ? ` @ ${st.weight_lbs} lb` : " (bodyweight)"}
                                {st.rpe != null ? ` · RPE ${st.rpe}` : ""}
                              </p>
                            ))}
                          </div>
                        </div>
                      ))}

                      {(() => {
                        const unresolved = msg.workout.exercises.filter((e) => !e.exercise_id);
                        const ready = msg.workout.exercises.length > 0 && unresolved.length === 0;
                        return (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleConfirmWorkout(i)}
                              disabled={!ready || savingIndex === i}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                            >
                              {savingIndex === i ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Log it
                            </button>
                            {!ready && (
                              <span className="text-[11px] text-amber-700">
                                Match {unresolved.length} exercise
                                {unresolved.length === 1 ? "" : "s"} first
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="mb-3 flex justify-start">
                <div className="rounded-2xl border-2 border-slate-300 bg-slate-50 px-3.5 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t border-slate-100 px-3 py-3">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => setLogMode((v) => !v)}
                title={logMode ? "Switch back to chat" : "Log a workout instead"}
                aria-pressed={logMode}
                className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition-colors ${
                  logMode
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-500 hover:text-slate-700"
                }`}
                aria-label="Toggle workout logging mode"
              >
                <Dumbbell className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={logMode ? "Bench 3x8 at 135, rows 3x10 at 95..." : "Type a message..."}
                rows={1}
                className="min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-slate-800 text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
