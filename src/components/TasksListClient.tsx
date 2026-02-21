"use client";

import { useMemo, useState } from "react";
import RtfEditor from "@/components/RtfEditor";

type Task = {
  id: string;
  title: string;
  status: string | null;
  priority: number | null;
  due_date: string | null;
  created_at: string;
  category: string | null;
  why: string | null;
  recurrence_rule: string | null;
  recurrence_anchor: string | null;
  book_id: string | null;
  chapter_id: string | null;
};

type TaskAttachment = {
  id: string;
  scope_id: string;
  filename: string;
  created_at: string;
  size_bytes: number | null;
  mime_type: string | null;
};

function toDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function snippet(text: string, max = 160) {
  const cleaned = text
    .replace(/[#*_>`]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

export default function TasksListClient({
  tasks,
  attachmentsByTask,
  categories,
}: {
  tasks: Task[];
  attachmentsByTask: Record<string, TaskAttachment[]>;
  categories: string[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editWhy, setEditWhy] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editRecurrence, setEditRecurrence] = useState("");
  const [editRecurrenceAnchor, setEditRecurrenceAnchor] = useState("");
  const attachmentsForSelected = selectedTask ? attachmentsByTask[selectedTask.id] || [] : [];

  const filtered = useMemo(() => {
    return tasks.filter((task) => {
      if (statusFilter !== "all" && (task.status || "open") !== statusFilter) return false;
      if (!search.trim()) return true;
      const hay = `${task.title} ${task.category || ""} ${task.why || ""}`.toLowerCase();
      return hay.includes(search.toLowerCase());
    });
  }, [tasks, search, statusFilter]);

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
    (document.getElementById("task-detail-dialog") as HTMLDialogElement | null)?.showModal();
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500">
          My Tasks ({filtered.length})
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="open">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Done</option>
            <option value="blocked">Blocked</option>
          </select>
          <input
            className="w-56 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/80 bg-white/70 shadow-sm">
        <div className="border-b border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500">Tasks</div>
        <div className="divide-y divide-slate-100">
          {filtered.map((task) => (
            <div key={task.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <button className="h-4 w-4 rounded-full border border-slate-300" type="button" onClick={() => openTask(task)} aria-label="Open task" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{task.title}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5">{task.status || "open"}</span>
                    {task.priority && <span className="rounded-full bg-amber-100 px-2 py-0.5">P{task.priority}</span>}
                    {task.due_date && <span className="rounded-full bg-rose-100 px-2 py-0.5">Due {task.due_date}</span>}
                    {task.category && <span className="rounded-full bg-blue-50 px-2 py-0.5">{task.category}</span>}
                  </div>
                  {task.why && <div className="mt-1 text-xs text-slate-500">{snippet(task.why)}</div>}
                </div>
              </div>
              <button
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs"
                type="button"
                onClick={() => openTask(task)}
              >
                Edit
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-sm text-slate-500">No tasks match your filters.</div>
          )}
        </div>
      </div>

      <dialog id="task-detail-dialog" className="w-[92vw] max-w-3xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Task Details</h3>
            <button
              className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-sm"
              type="button"
              onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
            >
              Close
            </button>
          </div>
          {selectedTask && (
            <form className="mt-4 grid gap-4" action="/tasks/update" method="post" data-toast="Task saved">
              <input type="hidden" name="id" value={selectedTask.id} />
              <input type="hidden" name="redirect" value="/tasks" />
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="text-xs text-slate-500">Title</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    name="title"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Status</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    name="status"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="open">to do</option>
                    <option value="in_progress">in progress</option>
                    <option value="done">done</option>
                    <option value="blocked">blocked</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500">Priority</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    name="priority"
                    type="number"
                    min="1"
                    max="5"
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Due Date</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    name="due_date"
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-slate-500">Category</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    name="category"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                  >
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
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    name="recurrence_rule"
                    value={editRecurrence}
                    onChange={(e) => setEditRecurrence(e.target.value)}
                    placeholder="weekly"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Recurrence Anchor</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    name="recurrence_anchor"
                    type="date"
                    value={editRecurrenceAnchor}
                    onChange={(e) => setEditRecurrenceAnchor(e.target.value)}
                  />
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
    </div>
  );
}
