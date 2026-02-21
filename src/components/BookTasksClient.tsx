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
}: {
  tasks: Task[];
  redirect: string;
  categories: string[];
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
        </div>
      </dialog>
    </>
  );
}
