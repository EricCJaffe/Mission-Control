"use client";

import { useState } from "react";
import RtfEditor from "@/components/RtfEditor";

type Task = {
  id: string;
  title: string;
  status: string | null;
  priority: number | null;
  due_date: string | null;
  category: string | null;
  why: string | null;
  recurrence_rule: string | null;
  recurrence_anchor: string | null;
  book_id: string | null;
  chapter_id: string | null;
};

type Subtask = {
  id: string;
  task_id: string;
  title: string;
  status: string | null;
};

type TaskLink = {
  id: string;
  task_id: string;
  label: string | null;
  url: string;
};

type TaskNoteLink = {
  id: string;
  task_id: string;
  note_id: string;
};

type NoteOption = {
  id: string;
  title: string;
};
function toDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function snippet(text: string, max = 140) {
  const cleaned = text
    .replace(/[#*_>`]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

export default function BookTasksClient({
  tasks,
  redirect,
  categories,
  subtasks,
  links,
  noteLinks,
  notes,
}: {
  tasks: Task[];
  redirect: string;
  categories: string[];
  subtasks: Subtask[];
  links: TaskLink[];
  noteLinks: TaskNoteLink[];
  notes: NoteOption[];
}) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editWhy, setEditWhy] = useState("");
  const [editRecurrence, setEditRecurrence] = useState("");
  const [editRecurrenceAnchor, setEditRecurrenceAnchor] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newNoteId, setNewNoteId] = useState("");
  const subtasksForSelected = selectedTask ? subtasks.filter((item) => item.task_id === selectedTask.id) : [];
  const linksForSelected = selectedTask ? links.filter((item) => item.task_id === selectedTask.id) : [];
  const noteLinksForSelected = selectedTask ? noteLinks.filter((item) => item.task_id === selectedTask.id) : [];

  function openTask(task: Task) {
    setSelectedTask(task);
    setEditTitle(task.title);
    setEditStatus(task.status || "open");
    setEditPriority(task.priority ? String(task.priority) : "");
    setEditDueDate(toDateInput(task.due_date));
    setEditCategory(task.category || "");
    setEditWhy(task.why || "");
    setEditRecurrence(task.recurrence_rule || "");
    setEditRecurrenceAnchor(toDateInput(task.recurrence_anchor));
    setNewSubtaskTitle("");
    setNewLinkLabel("");
    setNewLinkUrl("");
    setNewNoteId("");
    (document.getElementById("book-task-dialog") as HTMLDialogElement | null)?.showModal();
  }

  return (
    <>
      <div className="mt-4 grid gap-2 text-sm">
        {tasks.map((task) => (
          <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{task.title}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5">{task.status || "open"}</span>
                  {task.priority && <span className="rounded-full bg-amber-100 px-2 py-0.5">P{task.priority}</span>}
                  {task.due_date && <span className="rounded-full bg-rose-100 px-2 py-0.5">Due {task.due_date}</span>}
                  {task.category && <span className="rounded-full bg-blue-50 px-2 py-0.5">{task.category}</span>}
                </div>
                {task.why && <div className="mt-2 text-xs text-slate-500">{snippet(task.why)}</div>}
              </div>
              <button className="rounded-full border border-slate-200 px-3 py-1 text-xs" type="button" onClick={() => openTask(task)}>
                Edit
              </button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && <div className="text-xs text-slate-500">No tasks yet.</div>}
      </div>

      <dialog id="book-task-dialog" className="w-[92vw] max-w-2xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Task Details</h3>
          {selectedTask && (
            <form className="mt-4 grid gap-4" action="/tasks/update" method="post" data-toast="Task saved">
              <input type="hidden" name="id" value={selectedTask.id} />
              <input type="hidden" name="redirect" value={redirect} />
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">Title</label>
                  <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Status</label>
                  <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="status" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    <option value="open">to do</option>
                    <option value="in_progress">in progress</option>
                    <option value="done">done</option>
                    <option value="blocked">blocked</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Priority</label>
                  <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="priority" type="number" min="1" max="5" value={editPriority} onChange={(e) => setEditPriority(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Due Date</label>
                  <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="due_date" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Category</label>
                  <select className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="category" value={editCategory} onChange={(e) => setEditCategory(e.target.value)}>
                    <option value="">None</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-500">Description</label>
                <input type="hidden" name="why" value={editWhy} />
                <RtfEditor value={editWhy} onChange={setEditWhy} placeholder="Add details..." minHeight="160px" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">Recurrence</label>
                  <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="recurrence_rule" value={editRecurrence} onChange={(e) => setEditRecurrence(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Recurrence Anchor</label>
                  <input className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="recurrence_anchor" type="date" value={editRecurrenceAnchor} onChange={(e) => setEditRecurrenceAnchor(e.target.value)} />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" type="button" onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}>
                  Cancel
                </button>
                <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                  Save
                </button>
              </div>
            </form>
          )}

          {selectedTask && (
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold">Subtasks</div>
                <form className="mt-3 flex gap-2" action="/tasks/subtasks/new" method="post" data-toast="Subtask added">
                  <input type="hidden" name="task_id" value={selectedTask.id} />
                  <input type="hidden" name="redirect" value={redirect} />
                  <input
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
                    name="title"
                    placeholder="New subtask"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  />
                  <button className="rounded-lg border border-slate-200 px-2 py-1 text-xs" type="submit">
                    Add
                  </button>
                </form>
                <div className="mt-3 grid gap-2 text-xs">
                  {subtasksForSelected.map((sub) => (
                    <form key={sub.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1" action="/tasks/subtasks/update" method="post" data-toast="Subtask updated">
                      <input type="hidden" name="id" value={sub.id} />
                      <input type="hidden" name="redirect" value={redirect} />
                      <input className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs" name="title" defaultValue={sub.title} />
                      <select className="rounded border border-slate-200 px-2 py-1 text-[10px]" name="status" defaultValue={sub.status || "open"}>
                        <option value="open">open</option>
                        <option value="in_progress">in progress</option>
                        <option value="done">done</option>
                        <option value="blocked">blocked</option>
                      </select>
                      <button className="rounded border border-slate-200 px-2 py-1 text-[10px]" type="submit">
                        Save
                      </button>
                    </form>
                  ))}
                  {subtasksForSelected.length === 0 && <div className="text-xs text-slate-500">No subtasks yet.</div>}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-sm font-semibold">Links</div>
                <form className="mt-3 grid gap-2" action="/tasks/links/new" method="post" data-toast="Link added">
                  <input type="hidden" name="task_id" value={selectedTask.id} />
                  <input type="hidden" name="redirect" value={redirect} />
                  <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="label" placeholder="Label (optional)" value={newLinkLabel} onChange={(e) => setNewLinkLabel(e.target.value)} />
                  <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="url" placeholder="https://..." value={newLinkUrl} onChange={(e) => setNewLinkUrl(e.target.value)} required />
                  <button className="rounded-lg border border-slate-200 px-2 py-1 text-xs" type="submit">
                    Add Link
                  </button>
                </form>
                <div className="mt-3 grid gap-2 text-xs">
                  {linksForSelected.map((link) => (
                    <div key={link.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
                      <a className="truncate text-blue-700" href={link.url} target="_blank" rel="noreferrer">
                        {link.label || link.url}
                      </a>
                      <form action="/tasks/links/delete" method="post" data-toast="Link removed">
                        <input type="hidden" name="id" value={link.id} />
                        <input type="hidden" name="redirect" value={redirect} />
                        <button className="rounded border border-slate-200 px-2 py-1 text-[10px]" type="submit">
                          Remove
                        </button>
                      </form>
                    </div>
                  ))}
                  {linksForSelected.length === 0 && <div className="text-xs text-slate-500">No links yet.</div>}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
                <div className="text-sm font-semibold">Linked Notes</div>
                <form className="mt-3 flex flex-wrap gap-2" action="/tasks/notes/link" method="post" data-toast="Note linked">
                  <input type="hidden" name="task_id" value={selectedTask.id} />
                  <input type="hidden" name="redirect" value={redirect} />
                  <select className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="note_id" value={newNoteId} onChange={(e) => setNewNoteId(e.target.value)}>
                    <option value="">Select note…</option>
                    {notes.map((note) => (
                      <option key={note.id} value={note.id}>
                        {note.title}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-lg border border-slate-200 px-2 py-1 text-xs" type="submit" disabled={!newNoteId}>
                    Link
                  </button>
                </form>
                <div className="mt-3 grid gap-2 text-xs">
                  {noteLinksForSelected.map((link) => {
                    const note = notes.find((n) => n.id === link.note_id);
                    return (
                      <div key={link.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
                        <div className="truncate">{note?.title || "Linked note"}</div>
                        <form action="/tasks/notes/unlink" method="post" data-toast="Note unlinked">
                          <input type="hidden" name="id" value={link.id} />
                          <input type="hidden" name="redirect" value={redirect} />
                          <button className="rounded border border-slate-200 px-2 py-1 text-[10px]" type="submit">
                            Unlink
                          </button>
                        </form>
                      </div>
                    );
                  })}
                  {noteLinksForSelected.length === 0 && <div className="text-xs text-slate-500">No linked notes yet.</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
