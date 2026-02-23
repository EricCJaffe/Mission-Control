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
  is_template?: boolean | null;
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

type TaskAttachment = {
  id: string;
  scope_id: string;
  filename: string;
  created_at: string;
  size_bytes: number | null;
  mime_type: string | null;
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
  attachments,
  notes,
}: {
  tasks: Task[];
  redirect: string;
  categories: string[];
  subtasks: Subtask[];
  links: TaskLink[];
  noteLinks: TaskNoteLink[];
  attachments: TaskAttachment[];
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
  const [editTemplate, setEditTemplate] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newNoteId, setNewNoteId] = useState("");
  const [filter, setFilter] = useState<"all" | "todo" | "done" | "recurring" | "templates">("all");
  const subtasksForSelected = selectedTask ? subtasks.filter((item) => item.task_id === selectedTask.id) : [];
  const linksForSelected = selectedTask ? links.filter((item) => item.task_id === selectedTask.id) : [];
  const noteLinksForSelected = selectedTask ? noteLinks.filter((item) => item.task_id === selectedTask.id) : [];
  const attachmentsForSelected = selectedTask
    ? attachments.filter((item) => item.scope_id === selectedTask.id)
    : [];

  const pinned = tasks.filter((task) => String(task.priority || "") === "1");
  const overdue = tasks.filter((task) => task.due_date && task.due_date < new Date().toISOString().slice(0, 10));
  const openTasks = tasks.filter((task) => task.status !== "done");
  const filteredTasks = tasks.filter((task) => {
    if (filter === "todo") return task.status !== "done";
    if (filter === "done") return task.status === "done";
    if (filter === "recurring") return Boolean(task.recurrence_rule);
    if (filter === "templates") return Boolean(task.is_template);
    return true;
  });
  const filteredPinned = pinned.filter((task) => filteredTasks.includes(task));
  const filteredOverdue = overdue.filter((task) => filteredTasks.includes(task));
  const filteredOpen = openTasks.filter((task) => filteredTasks.includes(task));

  function quickStatus(task: Task, status: string) {
    const form = document.createElement("form");
    form.method = "post";
    form.action = "/tasks/update";
    form.dataset.toast = "Task updated";
    const fields: Record<string, string> = {
      id: task.id,
      redirect,
      title: task.title,
      status,
      priority: task.priority ? String(task.priority) : "",
      due_date: task.due_date ? toDateInput(task.due_date) : "",
      category: task.category || "",
      why: task.why || "",
      recurrence_rule: task.recurrence_rule || "",
      recurrence_anchor: task.recurrence_anchor ? toDateInput(task.recurrence_anchor) : "",
    };
    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

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
    setEditTemplate(Boolean(task.is_template));
    setNewSubtaskTitle("");
    setNewLinkLabel("");
    setNewLinkUrl("");
    setNewNoteId("");
    (document.getElementById("book-task-dialog") as HTMLDialogElement | null)?.showModal();
  }

  return (
    <>
      <div className="mt-4 grid gap-6 text-sm">
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            { key: "all", label: "All" },
            { key: "todo", label: "To Do" },
            { key: "done", label: "Done" },
            { key: "recurring", label: "Recurring" },
            { key: "templates", label: "Templates" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`rounded-full border px-3 py-1 ${filter === tab.key ? "bg-blue-700 text-white" : "bg-white text-slate-600"}`}
              onClick={() => setFilter(tab.key as typeof filter)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filteredPinned.length > 0 && (
          <section className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Pinned</div>
            <div className="grid gap-2">
              {filteredPinned.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm transition hover:border-amber-300"
                  role="button"
                  tabIndex={0}
                  onClick={() => openTask(task)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTask(task);
                    }
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{task.title}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">{task.status || "open"}</span>
                        {task.due_date && <span className="rounded-full bg-rose-100 px-2 py-0.5">Due {task.due_date}</span>}
                        {task.category && <span className="rounded-full bg-blue-50 px-2 py-0.5">{task.category}</span>}
                      </div>
                    </div>
                    <button
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        quickStatus(task, task.status === "done" ? "open" : "done");
                      }}
                    >
                      {task.status === "done" ? "Reopen" : "Done"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {filteredOverdue.length > 0 && (
          <section className="grid gap-2">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">Overdue</div>
            <div className="grid gap-2">
              {filteredOverdue.map((task) => (
                <div
                  key={task.id}
                  className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 shadow-sm transition hover:border-rose-300"
                  role="button"
                  tabIndex={0}
                  onClick={() => openTask(task)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTask(task);
                    }
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{task.title}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5">{task.status || "open"}</span>
                        {task.due_date && <span className="rounded-full bg-rose-100 px-2 py-0.5">Due {task.due_date}</span>}
                        {task.category && <span className="rounded-full bg-blue-50 px-2 py-0.5">{task.category}</span>}
                      </div>
                    </div>
                    <button
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        quickStatus(task, task.status === "done" ? "open" : "done");
                      }}
                    >
                      {task.status === "done" ? "Reopen" : "Done"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="grid gap-2">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">All Tasks</div>
          <div className="grid gap-2">
        {filteredOpen.map((task) => (
          <div
            key={task.id}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300"
            role="button"
            tabIndex={0}
            onClick={() => openTask(task)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openTask(task);
              }
            }}
          >
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
              <button
                className="rounded-full border border-slate-200 px-3 py-1 text-xs"
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  quickStatus(task, task.status === "done" ? "open" : "done");
                }}
              >
                {task.status === "done" ? "Reopen" : "Done"}
              </button>
            </div>
          </div>
        ))}
          {filteredOpen.length === 0 && <div className="text-xs text-slate-500">No tasks yet.</div>}
          </div>
        </section>
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

              <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" name="is_template" checked={editTemplate} onChange={(e) => setEditTemplate(e.target.checked)} />
                Save as template
              </label>
              <div>
                <button
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                  type="button"
                  onClick={() => {
                    setEditPriority(editPriority === "1" ? "" : "1");
                  }}
                >
                  {editPriority === "1" ? "Unpin" : "Pin"}
                </button>
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
                <form action="/tasks/delete" method="post" data-toast="Task deleted">
                  <input type="hidden" name="id" value={selectedTask.id} />
                  <input type="hidden" name="redirect" value={redirect} />
                  <button className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" type="submit">
                    Delete
                  </button>
                </form>
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

          {selectedTask && (
            <div className="mt-6">
              <div className="text-sm font-semibold">Attachments</div>
              <form
                className="mt-3 grid gap-2"
                action="/attachments/upload"
                method="post"
                encType="multipart/form-data"
                data-progress="true"
                data-toast="Attachment uploading"
              >
                <input type="hidden" name="scope_type" value="task" />
                <input type="hidden" name="scope_id" value={selectedTask.id} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" name="file" type="file" />
                <button className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-medium text-white shadow-sm" type="submit">
                  Upload Attachment
                </button>
              </form>
              <div className="mt-3 grid gap-2 text-xs">
                {attachmentsForSelected.map((file) => (
                  <div key={file.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
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
                {attachmentsForSelected.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-3 text-xs text-slate-500">
                    No attachments yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
