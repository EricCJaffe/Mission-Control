"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Chapter = {
  id: string;
  book_id: string;
  title: string;
  status: string | null;
  summary: string | null;
  markdown_current: string | null;
};

type Version = {
  id: string;
  version_number: number;
  created_at: string;
};

type ResearchNote = {
  id: string;
  title: string;
  content_md: string | null;
  tags: string[] | null;
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

type Section = {
  heading: string;
  start: number;
  end: number;
};

function extractSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const indices: Section[] = [];
  const headingRegex = /^#{1,6}\s+(.+)/;
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRegex);
    if (match) {
      const start = lineOffsets[i];
      let end = markdown.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (headingRegex.test(lines[j])) {
          end = lineOffsets[j] - 1;
          break;
        }
      }
      indices.push({ heading: match[1].trim(), start, end });
    }
  }

  return indices;
}

export default function ChapterEditor({
  chapter,
  versions,
  researchNotes,
  chatMessages,
}: {
  chapter: Chapter;
  versions: Version[];
  researchNotes: ResearchNote[];
  chatMessages: ChatMessage[];
}) {
  const [markdown, setMarkdown] = useState(chapter.markdown_current || "");
  const [title, setTitle] = useState(chapter.title || "");
  const [summary, setSummary] = useState(chapter.summary || "");
  const [status, setStatus] = useState(chapter.status || "outline");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [autosaveStatus, setAutosaveStatus] = useState("Idle");
  const [saveError, setSaveError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMode, setChatMode] = useState("Outline");
  const [messages, setMessages] = useState<ChatMessage[]>(chatMessages);
  const [aiProposal, setAiProposal] = useState("");
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [sectionDraft, setSectionDraft] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sections = useMemo(() => extractSections(markdown), [markdown]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      autosave();
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, title, summary, status]);

  async function autosave() {
    setAutosaveStatus("Saving...");
    setSaveError("");
    await fetch("/books/chapters/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapter_id: chapter.id,
        title,
        summary,
        status,
        markdown,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSaveError(data?.error || "Save failed");
          setAutosaveStatus("Error");
          return;
        }
        setAutosaveStatus("Saved");
      })
      .catch((err) => {
        setSaveError(err?.message || "Save failed");
        setAutosaveStatus("Error");
      });
  }

  function selectSection(section: Section) {
    setSelectedSection(section);
    setSectionDraft(markdown.slice(section.start, section.end));
  }

  function applySection() {
    if (!selectedSection) return;
    const before = markdown.slice(0, selectedSection.start);
    const after = markdown.slice(selectedSection.end);
    const next = `${before}${sectionDraft}\n${after}`;
    setMarkdown(next);
  }

  async function sendChat() {
    if (!chatInput.trim()) return;
    const payload = {
      scope_type: "chapter",
      scope_id: chapter.id,
      message: chatInput,
      mode: chatMode,
    };
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setMessages((prev) => [...prev, data.userMessage, data.assistantMessage]);
    setChatInput("");
    setAiProposal(data.assistantMessage.content);
  }

  async function applyPatch() {
    if (!aiProposal.trim()) return;
    const res = await fetch("/api/ai/patch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter_id: chapter.id, patch: aiProposal }),
    });
    const data = await res.json();
    if (data?.markdown) setMarkdown(data.markdown);
  }

  async function applyPatchFromMessage(content: string) {
    if (!content.trim()) return;
    const res = await fetch("/api/ai/patch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapter_id: chapter.id, patch: content }),
    });
    const data = await res.json();
    if (data?.markdown) setMarkdown(data.markdown);
  }

  return (
    <main className="pt-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Chapter Editor</h1>
          <p className="mt-1 text-sm text-slate-500">Autosave enabled · {autosaveStatus}</p>
          {saveError && <p className="mt-1 text-xs text-red-600">Save error: {saveError}</p>}
        </div>
        <a className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs" href={`/books/${chapter.book_id}`}>
          Back to book
        </a>
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-[220px_1fr_320px]">
        <aside className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <div className="text-xs uppercase tracking-widest text-slate-500">Outline</div>
          <div className="mt-3 grid gap-2 text-xs">
            {sections.map((section, idx) => (
              <button
                key={`${section.heading}-${idx}`}
                className="text-left rounded-lg border border-slate-200 bg-white px-2 py-1"
                onClick={() => selectSection(section)}
                type="button"
              >
                {section.heading}
              </button>
            ))}
            {sections.length === 0 && (
              <div className="text-xs text-slate-500">Add headings to build an outline.</div>
            )}
          </div>

          {selectedSection && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-widest text-slate-500">Section Editor</div>
              <textarea
                className="mt-2 min-h-[160px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                value={sectionDraft}
                onChange={(e) => setSectionDraft(e.target.value)}
              />
              <button className="mt-2 rounded-lg bg-blue-700 px-3 py-1 text-xs font-medium text-white" type="button" onClick={applySection}>
                Apply Section
              </button>
            </div>
          )}
        </aside>

        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">Edit Chapter</div>
            <div className="flex gap-2">
              <button className={`rounded-full border px-3 py-1 text-xs ${mode === "edit" ? "bg-blue-700 text-white" : "bg-white"}`} onClick={() => setMode("edit")} type="button">
                Edit
              </button>
              <button className={`rounded-full border px-3 py-1 text-xs ${mode === "preview" ? "bg-blue-700 text-white" : "bg-white"}`} onClick={() => setMode("preview")} type="button">
                Preview
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" />
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="outline">outline</option>
              <option value="draft">draft</option>
              <option value="review">review</option>
              <option value="final">final</option>
            </select>
          </div>

          <div className="mt-4">
            {mode === "edit" ? (
              <textarea
                className="min-h-[420px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
              />
            ) : (
              <div className="min-h-[420px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm whitespace-pre-line">
                {markdown || "No content yet."}
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-3">
            <button
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white"
              type="button"
              onClick={autosave}
            >
              Save Now
            </button>

            <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <summary className="cursor-pointer">Version History</summary>
              <div className="mt-2 grid gap-2">
                {versions.map((version) => (
                  <form key={version.id} action="/books/chapters/restore" method="post" className="flex items-center justify-between gap-2">
                    <input type="hidden" name="chapter_id" value={chapter.id} />
                    <input type="hidden" name="version_id" value={version.id} />
                    <div className="text-xs">Version {version.version_number}</div>
                    <button className="rounded-full border border-slate-200 px-2 py-1 text-xs" type="submit">
                      Restore
                    </button>
                  </form>
                ))}
                {versions.length === 0 && <div className="text-xs text-slate-500">No versions yet.</div>}
              </div>
            </details>
          </div>

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Research Notes (Chapter)</h3>
            <input
              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
              value={noteQuery}
              onChange={(e) => setNoteQuery(e.target.value)}
              placeholder="Search notes..."
            />
            <form className="mt-3 grid gap-2" action={`/books/${chapter.book_id}/research`} method="post">
              <input type="hidden" name="scope_type" value="chapter" />
              <input type="hidden" name="scope_id" value={chapter.id} />
              <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="title" placeholder="Note title" required />
              <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="tags" placeholder="tags" />
              <textarea className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="content_md" placeholder="Markdown content" />
              <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="submit">
                Add Note
              </button>
            </form>
            <div className="mt-3 grid gap-2">
              {researchNotes
                .filter((note) =>
                  noteQuery
                    ? `${note.title} ${note.content_md || ""}`.toLowerCase().includes(noteQuery.toLowerCase())
                    : true
                )
                .map((note) => (
                <div key={note.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs">
                  <div className="font-medium">{note.title}</div>
                  <div className="text-slate-500">{(note.tags || []).join(", ")}</div>
                  <div className="whitespace-pre-line">{note.content_md}</div>
                </div>
              ))}
              {researchNotes.length === 0 && <div className="text-xs text-slate-500">No notes yet.</div>}
            </div>
          </section>
        </div>

        <aside className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <div className="text-sm font-semibold">AI Writing Assistant (Scaffold)</div>
          <div className="mt-2 text-xs text-slate-500">Select a mode and request a draft. Approval required.</div>
          <select className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={chatMode} onChange={(e) => setChatMode(e.target.value)}>
            <option>Outline</option>
            <option>Expand</option>
            <option>Rewrite</option>
            <option>Tighten</option>
            <option>Add transitions</option>
            <option>Tone check</option>
            <option>Scripture integrity check</option>
          </select>
          <textarea className="mt-3 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Ask the assistant..." />
          <button className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white" type="button" onClick={sendChat}>
            Generate Proposal
          </button>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-widest text-slate-500">Proposal</div>
            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-xs whitespace-pre-line">
              {aiProposal || "No proposal yet."}
            </div>
            <button className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" type="button" onClick={applyPatch}>
              Apply to Chapter
            </button>
          </div>

          <div className="mt-6">
            <div className="text-xs uppercase tracking-widest text-slate-500">Chat</div>
            <div className="mt-2 grid gap-2 text-xs">
              {messages.map((msg) => (
                <div key={msg.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                  <div className="font-medium">{msg.role}</div>
                  <div className="whitespace-pre-line">{msg.content}</div>
                  {msg.role === "assistant" && (
                    <button
                      className="mt-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px]"
                      type="button"
                      onClick={() => applyPatchFromMessage(msg.content)}
                    >
                      Insert into chapter
                    </button>
                  )}
                </div>
              ))}
              {messages.length === 0 && <div className="text-xs text-slate-500">No messages yet.</div>}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
