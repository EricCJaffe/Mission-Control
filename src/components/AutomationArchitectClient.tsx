"use client";

import { useState } from "react";
import { useUiFeedback } from "@/components/UiFeedbackProvider";

export default function AutomationArchitectClient() {
  const { startProgress, stopProgress, pushToast } = useUiFeedback();
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [systems, setSystems] = useState("");
  const [constraints, setConstraints] = useState("");
  const [title, setTitle] = useState("Automation Architect Plan");
  const [tags, setTags] = useState("automation, workflow");
  const [saveNote, setSaveNote] = useState(true);
  const [saveSop, setSaveSop] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  async function run() {
    if (!goal.trim() || isRunning) return;
    setError("");
    setIsRunning(true);
    startProgress();
    try {
      const res = await fetch("/api/ai/automation-architect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          context,
          systems,
          constraints,
          title,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          save_note: saveNote,
          save_sop: saveSop,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || "Automation architect failed");
        return;
      }
      setOutput(data?.output || "");
      pushToast({ title: "Workflow generated", description: "Automation plan ready." });
    } catch (err: any) {
      setError(err?.message || "Automation architect failed");
    } finally {
      setIsRunning(false);
      stopProgress();
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Automation Architect</h2>
          <p className="mt-1 text-xs text-slate-500">
            Generate a step-by-step automation plan with safeguards, metrics, and SOP draft.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">Goal (required)</label>
          <textarea
            className="min-h-[90px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Describe the workflow you want automated."
          />
        </div>
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">Context</label>
          <textarea
            className="min-h-[90px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Audience, timeline, stakeholders, current process."
          />
        </div>
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">Systems/Tools</label>
          <textarea
            className="min-h-[90px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={systems}
            onChange={(e) => setSystems(e.target.value)}
            placeholder="e.g., Google Calendar, Notion, Zapier, Supabase, Email"
          />
        </div>
        <div className="grid gap-2">
          <label className="text-xs text-slate-500">Constraints</label>
          <textarea
            className="min-h-[90px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="Budget, privacy, approvals, rate limits, manual steps."
          />
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-xs text-slate-500">Save Title</label>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-slate-500">Tags</label>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={saveNote} onChange={(e) => setSaveNote(e.target.checked)} />
            Save as Note
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={saveSop} onChange={(e) => setSaveSop(e.target.checked)} />
            Save as SOP
          </label>
        </div>
      </div>

      {error && <div className="mt-3 text-xs text-red-600">Error: {error}</div>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={run}
          disabled={isRunning}
        >
          {isRunning ? "Generating..." : "Generate Workflow"}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-xs whitespace-pre-line">
        {output || "No workflow yet."}
      </div>
    </section>
  );
}
