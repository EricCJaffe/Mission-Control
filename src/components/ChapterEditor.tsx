"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Mark, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Markdown } from "tiptap-markdown";

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
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [sectionDraft, setSectionDraft] = useState("");
  const [noteQuery, setNoteQuery] = useState("");
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

  const editor = useEditor({
    extensions: [
      StarterKit,
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

  async function autosave() {
    const signature = JSON.stringify({ title, summary: summary || "", status, markdown });
    if (signature === lastSavedRef.current) {
      setAutosaveStatus("Saved");
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
        <aside className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
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
              onClick={autosave}
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

        </div>

        <aside className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Todos (Chapter)</h3>
            <form className="mt-3 grid gap-2" action="/tasks/new" method="post">
              <input type="hidden" name="chapter_id" value={chapter.id} />
              <input type="hidden" name="redirect" value={`/books/${chapter.book_id}/chapters/${chapter.id}`} />
              <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="title" placeholder="New todo" required />
              <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="submit">
                Add Todo
              </button>
            </form>
            <div className="mt-3 grid gap-2 text-xs">
              {todos.map((todo) => (
                <form key={todo.id} action="/tasks/update" method="post" className="rounded-lg border border-slate-200 bg-white px-2 py-2">
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

          <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold">Attachments</h3>
            <form className="mt-3 grid gap-2" action="/attachments/upload" method="post" encType="multipart/form-data">
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
            <form className="mt-3 grid gap-2" action="/books/chapters/comments/new" method="post">
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
            <form className="mt-3" action="/books/chapters/comments/ai-review" method="post">
              <input type="hidden" name="chapter_id" value={chapter.id} />
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs" type="submit">
                Run AI Editor Review
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

                  <form className="mt-2 grid gap-2" action="/books/chapters/comments/update" method="post">
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

                  <form className="mt-2" action="/books/chapters/comments/suggest" method="post">
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
                    <form className="mt-2" action="/books/chapters/comments/apply" method="post">
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
