"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { diffLines } from "diff";
import { Mark, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";
import RtfEditor from "@/components/RtfEditor";
import { useUiFeedback } from "@/components/UiFeedbackProvider";

type Chapter = {
  id: string;
  book_id: string;
  title: string;
  status: string | null;
  summary: string | null;
  markdown_current: string | null;
};

type BookChapter = {
  id: string;
  title: string;
  position: number | null;
  status: string | null;
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
  scope_type: string | null;
  scope_id: string | null;
  status?: string | null;
};

const noteStatusStyles: Record<string, string> = {
  inbox: "bg-slate-100 text-slate-600",
  in_progress: "bg-amber-100 text-amber-700",
  reviewed: "bg-blue-100 text-blue-700",
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

type Comment = {
  id: string;
  anchor_text: string | null;
  start_offset: number | null;
  end_offset: number | null;
  comment: string;
  suggested_patch: string | null;
  status: string | null;
  created_at: string;
};

type Attachment = {
  id: string;
  filename: string;
  created_at: string;
  size_bytes: number | null;
  mime_type: string | null;
};

type Todo = {
  id: string;
  title: string;
  status: string | null;
  due_date: string | null;
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
  bookChapters,
  versions,
  researchNotes,
  chatMessages,
  comments,
  attachments,
  todos,
}: {
  chapter: Chapter;
  bookChapters: BookChapter[];
  versions: Version[];
  researchNotes: ResearchNote[];
  chatMessages: ChatMessage[];
  comments: Comment[];
  attachments: Attachment[];
  todos: Todo[];
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
  const [aiError, setAiError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const { startProgress, stopProgress, pushToast } = useUiFeedback();
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [sectionDraft, setSectionDraft] = useState("");
  const [sectionInstruction, setSectionInstruction] = useState("");
  const [sectionSuggestion, setSectionSuggestion] = useState("");
  const [sectionError, setSectionError] = useState("");
  const [sectionIsGenerating, setSectionIsGenerating] = useState(false);
  const [sectionIsQueuing, setSectionIsQueuing] = useState(false);
  const [noteQuery, setNoteQuery] = useState("");
  const [noteStatusFilter, setNoteStatusFilter] = useState("all");
  const [noteTagFilter, setNoteTagFilter] = useState("");
  const [noteScope, setNoteScope] = useState<"chapter" | "book">("chapter");
  const [noteScopeId, setNoteScopeId] = useState(chapter.id);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteStatus, setNoteStatus] = useState("inbox");
  const [editNoteId, setEditNoteId] = useState<string | null>(null);
  const [editNoteTitle, setEditNoteTitle] = useState("");
  const [editNoteTags, setEditNoteTags] = useState("");
  const [editNoteContent, setEditNoteContent] = useState("");
  const [editNoteStatus, setEditNoteStatus] = useState("inbox");
  const [editNoteScopeTarget, setEditNoteScopeTarget] = useState<string>(chapter.id);
  const [viewNote, setViewNote] = useState<ResearchNote | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentPatch, setCommentPatch] = useState("");
  const [commentAnchor, setCommentAnchor] = useState("");
  const [commentFrom, setCommentFrom] = useState<number | null>(null);
  const [commentTo, setCommentTo] = useState<number | null>(null);

  const CommentMark = Mark.create({
    name: "commentMark",
    addAttributes() {
      return {
        id: {
          default: null,
        },
      };
    },
    renderHTML({ HTMLAttributes }) {
      return ["mark", mergeAttributes(HTMLAttributes, { class: "comment-mark" }), 0];
    },
  });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>(JSON.stringify({
    title: chapter.title,
    summary: chapter.summary || "",
    status: chapter.status || "outline",
    markdown: chapter.markdown_current || "",
  }));

  const sections = useMemo(() => extractSections(markdown), [markdown]);
  const proposalDiff = useMemo(() => {
    if (!aiProposal.trim()) return [];
    const merged = [markdown.trim(), aiProposal.trim()].filter(Boolean).join("\n\n");
    return diffLines(markdown, merged);
  }, [aiProposal, markdown]);
  const sectionDiff = useMemo(() => {
    if (!sectionSuggestion.trim()) return [];
    return diffLines(sectionDraft, sectionSuggestion);
  }, [sectionDraft, sectionSuggestion]);
  const chapterNumber = useMemo(() => {
    const ordered = [...bookChapters].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    const index = ordered.findIndex((ch) => ch.id === chapter.id);
    return index >= 0 ? index + 1 : null;
  }, [bookChapters, chapter.id]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      TaskList,
      TaskItem,
      Placeholder.configure({ placeholder: "Start writing your chapter..." }),
      Markdown,
      CommentMark,
    ],
    content: markdown || "",
    onUpdate: ({ editor }) => {
      const next = (editor.storage as any)?.markdown?.getMarkdown?.() || editor.getText();
      setMarkdown(next);
    },
  });

  useEffect(() => {
    if (editor && markdown !== ((editor.storage as any)?.markdown?.getMarkdown?.() || editor.getText())) {
      editor.commands.setContent(markdown || "", { emitUpdate: false });
    }
  }, [editor, markdown]);

  useEffect(() => {
    if (!editor) return;
    applyCommentHighlights(editor, comments || []);
  }, [editor, comments, markdown]);

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

  async function autosave(manual = false) {
    const signature = JSON.stringify({ title, summary: summary || "", status, markdown });
    if (signature === lastSavedRef.current) {
      setAutosaveStatus("Saved");
      if (manual) {
        pushToast({ title: "Already saved", description: "No new changes to save." });
      }
      return;
    }
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
        lastSavedRef.current = signature;
        setAutosaveStatus("Saved");
        if (manual) {
          pushToast({ title: "Chapter saved", description: "Your changes are safely stored." });
        }
      })
      .catch((err) => {
        setSaveError(err?.message || "Save failed");
        setAutosaveStatus("Error");
      });
  }

  function selectSection(section: Section) {
    setSelectedSection(section);
    setSectionDraft(markdown.slice(section.start, section.end));
    setSectionInstruction("");
    setSectionSuggestion("");
    setSectionError("");
  }

  function applySection() {
    if (!selectedSection) return;
    const before = markdown.slice(0, selectedSection.start);
    const after = markdown.slice(selectedSection.end);
    const next = `${before}${sectionDraft}\n${after}`;
    setMarkdown(next);
  }

  async function queueSectionProposal() {
    if (!selectedSection || !sectionSuggestion.trim() || sectionIsQueuing) return;
    setSectionError("");
    setSectionIsQueuing(true);
    startProgress();
    try {
      const before = markdown.slice(0, selectedSection.start);
      const after = markdown.slice(selectedSection.end);
      const proposedMarkdown = `${before}${sectionSuggestion}\n${after}`;
      const res = await fetch("/books/chapters/proposals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_id: chapter.id,
          instruction: `Section rewrite: ${selectedSection.heading}${sectionInstruction ? ` · ${sectionInstruction}` : ""}`,
          proposed_markdown: proposedMarkdown,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSectionError(err?.error || "Failed to queue proposal");
        return;
      }
      pushToast({ title: "Proposal queued", description: "Review it in the AI Proposal Queue." });
    } catch (err: any) {
      setSectionError(err?.message || "Failed to queue proposal");
    } finally {
      setSectionIsQueuing(false);
      stopProgress();
    }
  }

  async function suggestSectionRewrite() {
    if (!selectedSection || !sectionDraft.trim() || sectionIsGenerating) return;
    setSectionError("");
    setSectionIsGenerating(true);
    startProgress();
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope_type: "chapter",
          scope_id: chapter.id,
          message: `Rewrite this section with the instruction below.\n\nInstruction:\n${sectionInstruction || "Improve clarity and flow while preserving meaning."}\n\nSection:\n${sectionDraft}`,
          mode: "Section rewrite",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSectionError(err?.error || "AI request failed");
        return;
      }
      const data = await res.json();
      const content = data?.assistantMessage?.content || "";
      setSectionSuggestion(content.trim());
    } catch (err: any) {
      setSectionError(err?.message || "AI request failed");
    } finally {
      setSectionIsGenerating(false);
      stopProgress();
    }
  }

  function openEditNote(note: ResearchNote) {
    setEditNoteId(note.id);
    setEditNoteTitle(note.title);
    setEditNoteTags((note.tags || []).join(", "));
    setEditNoteContent(note.content_md || "");
    setEditNoteStatus(note.status || "inbox");
    if (note.scope_type === "book") {
      setEditNoteScopeTarget("book");
    } else if (note.scope_id) {
      setEditNoteScopeTarget(note.scope_id);
    } else {
      setEditNoteScopeTarget(chapter.id);
    }
    (document.getElementById("edit-chapter-note-dialog") as HTMLDialogElement | null)?.showModal();
  }

  function openViewNote(note: ResearchNote) {
    setViewNote(note);
    (document.getElementById("view-chapter-note-dialog") as HTMLDialogElement | null)?.showModal();
  }

  function noteSnippet(text: string) {
    const cleaned = text
      .replace(/[#*_>`]/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return "";
    return cleaned.length > 180 ? `${cleaned.slice(0, 180)}…` : cleaned;
  }

  async function sendChat() {
    if (!chatInput.trim() || isGenerating) return;
    setAiError("");
    setIsGenerating(true);
    startProgress();
    const userId = `local-user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pendingId = `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const now = new Date().toISOString();
    const currentInput = chatInput;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: currentInput, created_at: now },
      { id: pendingId, role: "assistant", content: "Working...", created_at: now },
    ]);
    const payload = {
      scope_type: "chapter",
      scope_id: chapter.id,
      message: currentInput,
      mode: chatMode,
    };
    const res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setAiError(err?.error || "AI request failed");
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === pendingId ? { ...msg, content: "AI request failed. Try again." } : msg
        )
      );
      setIsGenerating(false);
      stopProgress();
      return;
    }
    const data = await res.json();
    const content = data?.assistantMessage?.content || "(empty)";
    setMessages((prev) =>
      prev.map((msg) => (msg.id === pendingId ? { ...msg, content } : msg))
    );
    setAiProposal(content);
    setChatInput("");
    setIsGenerating(false);
    stopProgress();
  }

  async function applyPatch() {
    if (!aiProposal.trim() || isApplying) return;
    setAiError("");
    setIsApplying(true);
    startProgress();
    try {
      const res = await fetch("/api/ai/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: chapter.id, patch: aiProposal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiError(data?.error || "AI patch failed");
        return;
      }
      if (data?.markdown) setMarkdown(data.markdown);
    } finally {
      setIsApplying(false);
      stopProgress();
    }
  }

  async function applyPatchFromMessage(content: string) {
    if (!content.trim() || isApplying) return;
    setAiError("");
    setIsApplying(true);
    startProgress();
    try {
      const res = await fetch("/api/ai/patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapter_id: chapter.id, patch: content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAiError(data?.error || "AI patch failed");
        return;
      }
      if (data?.markdown) setMarkdown(data.markdown);
    } finally {
      setIsApplying(false);
      stopProgress();
    }
  }

  function captureSelection() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) return;
    const selected = editor.state.doc.textBetween(from, to, "\n");
    setCommentAnchor(selected.slice(0, 400));
    setCommentFrom(from);
    setCommentTo(to);
  }

  function applyCommentHighlights(currentEditor: typeof editor, commentList: Comment[]) {
    if (!currentEditor) return;
    const { state, view } = currentEditor;
    let tr = state.tr;
    commentList.forEach((comment) => {
      if (comment.start_offset && comment.end_offset && comment.end_offset > comment.start_offset) {
        tr = tr.addMark(comment.start_offset, comment.end_offset, state.schema.marks.commentMark.create({ id: comment.id }));
        return;
      }
      if (comment.anchor_text) {
        const ranges = findRanges(state.doc, comment.anchor_text);
        ranges.forEach((range) => {
          tr = tr.addMark(range.from, range.to, state.schema.marks.commentMark.create({ id: comment.id }));
        });
      }
    });
    if (tr.docChanged || tr.storedMarks || tr.steps.length) {
      view.dispatch(tr);
    }
  }

  function findRanges(doc: any, needle: string) {
    const ranges: { from: number; to: number }[] = [];
    if (!needle) return ranges;
    doc.descendants((node: any, pos: number) => {
      if (!node.isText || !node.text) return;
      let index = node.text.indexOf(needle);
      while (index !== -1) {
        const from = pos + index;
        const to = from + needle.length;
        ranges.push({ from, to });
        index = node.text.indexOf(needle, index + needle.length);
      }
    });
    return ranges;
  }

  function focusComment(comment: Comment) {
    if (!editor) return;
    const { state } = editor;
    let from = comment.start_offset || null;
    let to = comment.end_offset || null;
    if ((!from || !to) && comment.anchor_text) {
      const ranges = findRanges(state.doc, comment.anchor_text);
      if (ranges.length > 0) {
        from = ranges[0].from;
        to = ranges[0].to;
      }
    }
    if (from && to) {
      editor.commands.setTextSelection({ from, to });
      editor.commands.scrollIntoView();
    }
  }


  return (
    <main className="pt-4 md:pt-8">
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

      <section className="mt-6 grid gap-4 lg:grid-cols-[240px_1fr_320px]">
        <aside className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="text-xs uppercase tracking-widest text-slate-500">Book Outline</div>
          <div className="mt-3 grid gap-2 text-xs">
            {bookChapters.map((bookChapter) => (
              <a
                key={bookChapter.id}
                className={`rounded-lg border px-2 py-1 ${
                  bookChapter.id === chapter.id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white"
                }`}
                href={`/books/${chapter.book_id}/chapters/${bookChapter.id}`}
              >
                {bookChapter.title}
              </a>
            ))}
            {bookChapters.length === 0 && <div className="text-xs text-slate-500">No chapters yet.</div>}
          </div>

          <div className="mt-4 text-xs uppercase tracking-widest text-slate-500">Outline</div>
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
              <div className="mt-2 grid gap-2">
                <input
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                  placeholder="AI instruction (optional)"
                  value={sectionInstruction}
                  onChange={(e) => setSectionInstruction(e.target.value)}
                />
                {sectionError && <div className="text-[11px] text-red-600">AI error: {sectionError}</div>}
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs"
                    type="button"
                    onClick={suggestSectionRewrite}
                    disabled={sectionIsGenerating}
                  >
                    {sectionIsGenerating ? "Working..." : "AI Suggest Rewrite"}
                  </button>
                  <button className="rounded-lg bg-blue-700 px-3 py-1 text-xs font-medium text-white" type="button" onClick={applySection}>
                    Apply Section
                  </button>
                </div>
              </div>
              {sectionSuggestion && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2 text-[11px] whitespace-pre-line">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">AI Suggestion</div>
                  <div className="mt-2">{sectionSuggestion}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="rounded-full border border-slate-200 px-2 py-1 text-[10px]"
                      type="button"
                      onClick={() => setSectionDraft(sectionSuggestion)}
                    >
                      Use Suggestion
                    </button>
                    <button
                      className="rounded-full border border-slate-200 px-2 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={queueSectionProposal}
                      disabled={sectionIsQueuing}
                    >
                      {sectionIsQueuing ? "Queuing..." : "Queue Proposal"}
                    </button>
                  </div>
                </div>
              )}
              {sectionDiff.length > 0 && (
                <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-[11px]">
                  <summary className="cursor-pointer">Preview diff</summary>
                  <div className="mt-2 font-mono">
                    {sectionDiff.map((part, idx) => {
                      const color = part.added ? "text-emerald-700 bg-emerald-50" : part.removed ? "text-red-700 bg-red-50" : "text-slate-600";
                      return (
                        <div key={idx} className={`${color} whitespace-pre-wrap`}>
                          {part.value}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          )}
        </aside>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">
              Edit Chapter {chapterNumber ? `· Chapter ${chapterNumber}` : ""}
            </div>
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
            <div className="text-xs text-slate-500">
              Word count: {markdown.trim().split(/\s+/).filter(Boolean).length}
            </div>
          </div>

          <div className="mt-4">
            {mode === "edit" ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <div className="mb-2 flex flex-wrap gap-2 text-xs">
                  <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleBold().run()}>
                    Bold
                  </button>
                  <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleItalic().run()}>
                    Italic
                  </button>
                  <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleUnderline().run()}>
                    Underline
                  </button>
                  <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
                    H2
                  </button>
                  <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                    Bullets
                  </button>
                  <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                    Numbered
                  </button>
                  <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
                    Quote
                  </button>
                  <button className="rounded border px-2 py-1" type="button" onClick={() => editor?.chain().focus().toggleTaskList().run()}>
                    Checklist
                  </button>
                </div>
                <div className="min-h-[360px]">
                  <EditorContent editor={editor} />
                </div>
              </div>
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
              onClick={() => autosave(true)}
            >
              {autosaveStatus === "Saving..." && "Saving…"}
              {autosaveStatus === "Saved" && "Saved ✓"}
              {autosaveStatus === "Error" && "Save Failed"}
              {autosaveStatus === "Idle" && "Save Now"}
            </button>

            <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <summary className="cursor-pointer">Version History</summary>
              <div className="mt-2 grid gap-2">
                {versions.map((version) => (
                  <form key={version.id} action="/books/chapters/restore" method="post" className="flex items-center justify-between gap-2" data-toast="Version restored">
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

        </div>

        <aside className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Todos (Chapter)</h3>
            <form className="mt-3 grid gap-2" action="/tasks/new" method="post" data-toast="Todo added">
              <input type="hidden" name="chapter_id" value={chapter.id} />
              <input type="hidden" name="redirect" value={`/books/${chapter.book_id}/chapters/${chapter.id}`} />
              <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="title" placeholder="New todo" required />
              <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="submit">
                Add Todo
              </button>
            </form>
            <div className="mt-3 grid gap-2 text-xs">
              {todos.map((todo) => (
                <form key={todo.id} action="/tasks/update" method="post" className="rounded-lg border border-slate-200 bg-white px-2 py-2" data-toast="Todo updated">
                  <input type="hidden" name="id" value={todo.id} />
                  <input type="hidden" name="redirect" value={`/books/${chapter.book_id}/chapters/${chapter.id}`} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{todo.title}</div>
                    <select className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px]" name="status" defaultValue={todo.status || "open"}>
                      <option value="open">open</option>
                      <option value="in_progress">in progress</option>
                      <option value="done">done</option>
                      <option value="blocked">blocked</option>
                    </select>
                  </div>
                  <div className="mt-1 text-[10px] text-slate-500">Due: {todo.due_date || "n/a"}</div>
                  <button className="mt-2 rounded-full border border-slate-200 px-2 py-0.5 text-[10px]" type="submit">
                    Update
                  </button>
                </form>
              ))}
              {todos.length === 0 && <div className="text-xs text-slate-500">No todos yet.</div>}
            </div>
          </section>

          <div className="text-sm font-semibold mt-6">AI Writing Assistant (Scaffold)</div>
          <div className="mt-2 text-xs text-slate-500">Select a mode and request a draft. Approval required.</div>
          {aiError && <div className="mt-2 text-xs text-red-600">AI error: {aiError}</div>}
          {(isGenerating || isApplying) && (
            <div className="mt-2 text-xs text-slate-500">
              {isGenerating ? "Generating proposal…" : "Applying patch…"}
            </div>
          )}
          <select className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={chatMode} onChange={(e) => setChatMode(e.target.value)}>
            <option>Outline</option>
            <option>Expand</option>
            <option>Rewrite</option>
            <option>Tighten</option>
            <option>Add transitions</option>
            <option>Tone check</option>
            <option>Scripture integrity check</option>
            <option>Editor review</option>
          </select>
          <textarea
            className="mt-3 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask the assistant..."
            disabled={isGenerating}
          />
          <button
            className="mt-3 w-full rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={sendChat}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <span className="inline-flex items-center justify-center gap-2">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                Generating...
              </span>
            ) : (
              "Generate Proposal"
            )}
          </button>

          <div className="mt-4">
            <div className="text-xs uppercase tracking-widest text-slate-500">Proposal</div>
            <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-xs whitespace-pre-line">
              {aiProposal || "No proposal yet."}
            </div>
            {proposalDiff.length > 0 && (
              <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                <summary className="cursor-pointer">Preview diff</summary>
                <div className="mt-2 font-mono text-[11px] leading-relaxed">
                  {proposalDiff.map((part, idx) => {
                    const color = part.added ? "text-emerald-700 bg-emerald-50" : part.removed ? "text-red-700 bg-red-50" : "text-slate-600";
                    return (
                      <div key={idx} className={`${color} whitespace-pre-wrap`}>
                        {part.value}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
            <button
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={applyPatch}
              disabled={isApplying || !aiProposal.trim()}
            >
              {isApplying ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                  Applying...
                </span>
              ) : (
                "Apply to Chapter"
              )}
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
                      className="mt-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-60"
                      type="button"
                      onClick={() => applyPatchFromMessage(msg.content)}
                      disabled={isApplying}
                    >
                      {isApplying ? "Applying..." : "Insert into chapter"}
                    </button>
                  )}
                </div>
              ))}
              {messages.length === 0 && <div className="text-xs text-slate-500">No messages yet.</div>}
            </div>
          </div>

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Research Notes (Chapter)</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                value={noteQuery}
                onChange={(e) => setNoteQuery(e.target.value)}
                placeholder="Search notes..."
              />
              <select
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                value={noteStatusFilter}
                onChange={(e) => setNoteStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="inbox">Inbox</option>
                <option value="in_progress">In Progress</option>
                <option value="reviewed">Reviewed</option>
              </select>
              <input
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                value={noteTagFilter}
                onChange={(e) => setNoteTagFilter(e.target.value)}
                placeholder="Tag..."
              />
              <button
                className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white"
                type="button"
                onClick={() => (document.getElementById("add-chapter-note-dialog") as HTMLDialogElement | null)?.showModal()}
              >
                Add Note
              </button>
            </div>

            <dialog id="add-chapter-note-dialog" className="w-[92vw] max-w-2xl rounded-2xl border border-slate-200 p-0 shadow-xl">
              <div className="rounded-2xl bg-white p-6">
                <h4 className="text-base font-semibold">Add Research Note</h4>
                <form className="mt-3 grid gap-3" action={`/books/${chapter.book_id}/research`} method="post" data-toast="Research note added">
                  <input type="hidden" name="redirect" value={`/books/${chapter.book_id}/chapters/${chapter.id}`} />
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <label className="text-xs text-slate-500">Scope</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        name="scope_type"
                        value={noteScope}
                        onChange={(e) => {
                          const next = e.target.value as "chapter" | "book";
                          setNoteScope(next);
                          setNoteScopeId(next === "book" ? chapter.book_id : chapter.id);
                        }}
                      >
                        <option value="chapter">Chapter</option>
                        <option value="book">Book (General)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Chapter</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        name="scope_id"
                        value={noteScopeId}
                        onChange={(e) => setNoteScopeId(e.target.value)}
                        disabled={noteScope !== "chapter"}
                      >
                        {bookChapters.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.title}
                          </option>
                        ))}
                      </select>
                      {noteScope === "book" && <input type="hidden" name="scope_id" value={chapter.book_id} />}
                    </div>
                  </div>
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                    name="title"
                    placeholder="Note title"
                    required
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                  />
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                    name="tags"
                    placeholder="tags (comma-separated)"
                    value={noteTags}
                    onChange={(e) => setNoteTags(e.target.value)}
                  />
                  <div>
                    <label className="text-xs text-slate-500">Status</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      name="status"
                      value={noteStatus}
                      onChange={(e) => setNoteStatus(e.target.value)}
                    >
                      <option value="inbox">Inbox</option>
                      <option value="in_progress">In Progress</option>
                      <option value="reviewed">Reviewed</option>
                    </select>
                  </div>
                  <input type="hidden" name="content_md" value={noteContent} />
                  <RtfEditor value={noteContent} onChange={setNoteContent} placeholder="Write the note..." minHeight="160px" />
                  <div className="flex justify-end gap-2">
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      type="button"
                      onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
                    >
                      Cancel
                    </button>
                    <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                      Save Note
                    </button>
                  </div>
                </form>
              </div>
            </dialog>

            <dialog id="edit-chapter-note-dialog" className="w-[92vw] max-w-2xl rounded-2xl border border-slate-200 p-0 shadow-xl">
              <div className="rounded-2xl bg-white p-6">
                <h4 className="text-base font-semibold">Edit Research Note</h4>
                <form className="mt-3 grid gap-3" action="/books/research/update" method="post" data-toast="Research note updated">
                  <input type="hidden" name="note_id" value={editNoteId || ""} />
                  <input type="hidden" name="redirect" value={`/books/${chapter.book_id}/chapters/${chapter.id}`} />
                  <div className="grid gap-2">
                    <div>
                      <label className="text-xs text-slate-500">Chapter (optional)</label>
                      <select
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={editNoteScopeTarget}
                        onChange={(e) => setEditNoteScopeTarget(e.target.value)}
                      >
                        <option value="book">Book (General)</option>
                        {bookChapters.map((ch) => (
                          <option key={ch.id} value={ch.id}>
                            {ch.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <input type="hidden" name="scope_type" value={editNoteScopeTarget === "book" ? "book" : "chapter"} />
                  <input
                    type="hidden"
                    name="scope_id"
                    value={editNoteScopeTarget === "book" ? chapter.book_id : editNoteScopeTarget}
                  />
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                    name="title"
                    placeholder="Note title"
                    required
                    value={editNoteTitle}
                    onChange={(e) => setEditNoteTitle(e.target.value)}
                  />
                  <input
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2"
                    name="tags"
                    placeholder="tags (comma-separated)"
                    value={editNoteTags}
                    onChange={(e) => setEditNoteTags(e.target.value)}
                  />
                  <div>
                    <label className="text-xs text-slate-500">Status</label>
                    <select
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      name="status"
                      value={editNoteStatus}
                      onChange={(e) => setEditNoteStatus(e.target.value)}
                    >
                      <option value="inbox">Inbox</option>
                      <option value="in_progress">In Progress</option>
                      <option value="reviewed">Reviewed</option>
                    </select>
                  </div>
                  <input type="hidden" name="content_md" value={editNoteContent} />
                  <RtfEditor value={editNoteContent} onChange={setEditNoteContent} placeholder="Write the note..." minHeight="160px" />
                  <div className="flex justify-end gap-2">
                    <button
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      type="button"
                      onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
                    >
                      Cancel
                    </button>
                    <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                      Update Note
                    </button>
                  </div>
                </form>
                <form className="mt-4 grid gap-2" action="/books/ai/place" method="post" data-progress="true" data-toast="Concept placement started">
                  <input type="hidden" name="book_id" value={chapter.book_id} />
                  <input type="hidden" name="concept" value={`${editNoteTitle}\n\n${editNoteContent}`} />
                  <textarea
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                    name="instruction"
                    placeholder="AI placement notes (optional)"
                  />
                  <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" type="submit">
                    AI Place This Note Into Book
                  </button>
                </form>
              </div>
            </dialog>

            <dialog id="view-chapter-note-dialog" className="w-[92vw] max-w-2xl rounded-2xl border border-slate-200 p-0 shadow-xl">
              <div className="rounded-2xl bg-white p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-base font-semibold">{viewNote?.title || "Research Note"}</h4>
                    <div className="mt-1 text-xs text-slate-500">
                      {viewNote?.scope_type === "book" ? "Book (General)" : "Chapter note"}
                    </div>
                  </div>
            {viewNote && (
              <button
                className="rounded-full border border-slate-200 px-3 py-1 text-xs"
                type="button"
                onClick={() => {
                  (document.getElementById("view-chapter-note-dialog") as HTMLDialogElement | null)?.close();
                  openEditNote(viewNote);
                }}
              >
                Edit
              </button>
            )}
            {viewNote && (
              <form action="/books/ai/place" method="post" data-progress="true" data-toast="AI placement started">
                <input type="hidden" name="book_id" value={chapter.book_id} />
                <input type="hidden" name="concept" value={`${viewNote.title}\n\n${viewNote.content_md || ""}`} />
                <button className="rounded-full border border-slate-200 px-3 py-1 text-xs" type="submit">
                  AI Place
                </button>
              </form>
            )}
          </div>
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 whitespace-pre-line">
            {viewNote?.content_md || "No content yet."}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{(viewNote?.tags || []).length ? `Tags: ${(viewNote?.tags || []).join(", ")}` : "No tags"}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                noteStatusStyles[viewNote?.status || "inbox"] || noteStatusStyles.inbox
              }`}
            >
              {viewNote?.status || "inbox"}
            </span>
          </div>
                <form
                  className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"
                  action="/books/ai/place"
                  method="post"
                  data-progress="true"
                  data-toast="AI placement started"
                >
                  <div className="text-[11px] uppercase tracking-wide text-slate-500">AI Placement Assistant</div>
                  <input type="hidden" name="book_id" value={chapter.book_id} />
                  <input type="hidden" name="concept" value={`${viewNote?.title || ""}\n\n${viewNote?.content_md || ""}`} />
                  <textarea
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                    name="instruction"
                    placeholder="Optional placement or tone notes..."
                  />
                  <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" type="submit">
                    Suggest Placement + Proposal
                  </button>
                  <div className="text-[11px] text-slate-500">
                    Creates a proposal so you can review before applying to a chapter.
                  </div>
                </form>
                <div className="mt-4 flex justify-end">
                  <button
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    type="button"
                    onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
                  >
                    Close
                  </button>
                </div>
              </div>
            </dialog>

            <div className="mt-3 grid gap-2">
              {researchNotes
                .filter((note) => {
                  if (
                    noteQuery &&
                    !`${note.title} ${note.content_md || ""}`.toLowerCase().includes(noteQuery.toLowerCase())
                  ) {
                    return false;
                  }
                  if (noteStatusFilter !== "all" && (note.status || "inbox") !== noteStatusFilter) {
                    return false;
                  }
                  if (noteTagFilter.trim()) {
                    const tagMatch = (note.tags || []).some((tag) =>
                      tag.toLowerCase().includes(noteTagFilter.toLowerCase())
                    );
                    if (!tagMatch) return false;
                  }
                  return true;
                })
                .map((note) => (
                <div
                  key={note.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm"
                  role="button"
                  tabIndex={0}
                  onClick={() => openViewNote(note)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openViewNote(note);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{note.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-500">
                        <span>{(note.tags || []).join(", ")}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            noteStatusStyles[note.status || "inbox"] || noteStatusStyles.inbox
                          }`}
                        >
                          {note.status || "inbox"}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">Scope: {note.scope_type === "book" ? "Book" : "Chapter"}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px]"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditNote(note);
                        }}
                      >
                        Edit
                      </button>
                      <form
                        action="/books/ai/place"
                        method="post"
                        data-progress="true"
                        data-toast="AI placement started"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input type="hidden" name="book_id" value={chapter.book_id} />
                        <input type="hidden" name="concept" value={`${note.title}\n\n${note.content_md || ""}`} />
                        <button className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px]" type="submit">
                          AI Place
                        </button>
                      </form>
                      <form
                        action="/books/research/delete"
                        method="post"
                        data-toast="Research note deleted"
                        data-progress="true"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <input type="hidden" name="note_id" value={note.id} />
                        <input type="hidden" name="redirect" value={`/books/${chapter.book_id}/chapters/${chapter.id}`} />
                        <button className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px]" type="submit">
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-600">{noteSnippet(note.content_md || "") || "No content yet."}</div>
                </div>
              ))}
              {researchNotes.length === 0 && <div className="text-xs text-slate-500">No notes yet.</div>}
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Attachments</h3>
            <form className="mt-3 grid gap-2" action="/attachments/upload" method="post" encType="multipart/form-data" data-progress="true" data-toast="Attachment uploading">
              <input type="hidden" name="scope_type" value="chapter" />
              <input type="hidden" name="scope_id" value={chapter.id} />
              <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="file" type="file" />
              <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="submit">
                Upload Attachment
              </button>
            </form>
            <div className="mt-3 grid gap-2 text-xs">
              {attachments.map((file) => (
                <div key={file.id} className="rounded-lg border border-slate-200 bg-white px-2 py-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{file.filename}</div>
                    <a className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px]" href={`/attachments/${file.id}/download`}>
                      Download
                    </a>
                  </div>
                  {file.mime_type?.startsWith("image/") && (
                    <img
                      src={`/attachments/${file.id}/download`}
                      alt={file.filename}
                      className="mt-2 max-h-40 rounded border border-slate-200 object-contain"
                    />
                  )}
                  <div className="text-slate-500">
                    {Math.round((file.size_bytes || 0) / 1024)} KB · {new Date(file.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
              {attachments.length === 0 && <div className="text-xs text-slate-500">No attachments yet.</div>}
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Editorial Comments</h3>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <button
                className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs"
                type="button"
                onClick={captureSelection}
              >
                Use selected text
              </button>
              <span>{commentAnchor ? `Anchor: ${commentAnchor.slice(0, 80)}...` : "No selection captured."}</span>
            </div>
            <form className="mt-3 grid gap-2" action="/books/chapters/comments/new" method="post" data-toast="Comment added">
              <input type="hidden" name="chapter_id" value={chapter.id} />
              <input type="hidden" name="anchor_text" value={commentAnchor} />
              <input type="hidden" name="start_offset" value={commentFrom ?? ""} />
              <input type="hidden" name="end_offset" value={commentTo ?? ""} />
              <textarea
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                name="comment"
                placeholder="Comment / feedback"
                required
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              <textarea
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                name="suggested_patch"
                placeholder="Suggested change (optional)"
                value={commentPatch}
                onChange={(e) => setCommentPatch(e.target.value)}
              />
              <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="submit">
                Add Comment
              </button>
            </form>
            <form className="mt-3" action="/books/chapters/comments/ai-review" method="post" data-progress="true" data-toast="AI review started">
              <input type="hidden" name="chapter_id" value={chapter.id} />
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" type="submit">
                Run AI Editor Review
              </button>
            </form>
            <form className="mt-2" action="/books/chapters/comments/ai-inline-review" method="post" data-progress="true" data-toast="Inline review queued">
              <input type="hidden" name="chapter_id" value={chapter.id} />
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" type="submit">
                AI Inline Review (Anchored)
              </button>
            </form>
            <div className="mt-3 grid gap-3">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">Comment</div>
                    <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px]">
                      {comment.status || "open"}
                    </span>
                  </div>

                  <form className="mt-2 grid gap-2" action="/books/chapters/comments/update" method="post" data-toast="Comment updated">
                    <input type="hidden" name="comment_id" value={comment.id} />
                    <textarea
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                      name="comment"
                      defaultValue={comment.comment}
                    />
                    <textarea
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                      name="suggested_patch"
                      defaultValue={comment.suggested_patch || ""}
                      placeholder="Suggested patch..."
                    />
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px]" type="submit">
                        Save
                      </button>
                      <button
                        className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px]"
                        type="button"
                        onClick={() => focusComment(comment)}
                      >
                        Highlight
                      </button>
                    </div>
                  </form>

                  <form className="mt-2" action="/books/chapters/comments/suggest" method="post" data-progress="true" data-toast="Suggestion queued">
                    <input type="hidden" name="comment_id" value={comment.id} />
                    <input type="hidden" name="chapter_id" value={chapter.id} />
                    <button className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px]" type="submit">
                      AI Suggest
                    </button>
                  </form>

                  {comment.anchor_text && (
                    <div className="mt-2 text-slate-500">Anchor: {comment.anchor_text}</div>
                  )}
                  {comment.suggested_patch && (
                    <form className="mt-2" action="/books/chapters/comments/apply" method="post" data-progress="true" data-toast="Applying suggestion">
                      <input type="hidden" name="comment_id" value={comment.id} />
                      <input type="hidden" name="chapter_id" value={chapter.id} />
                      <button className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px]" type="submit">
                        Apply Patch
                      </button>
                    </form>
                  )}
                </div>
              ))}
              {comments.length === 0 && <div className="text-xs text-slate-500">No comments yet.</div>}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}
