"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MarkdownEditor from "@/components/MarkdownEditor";
import { ExternalLink, Plus, Repeat, X } from "lucide-react";
import { useRouter } from "next/navigation";
import RecurrencePicker from "@/components/tasks/RecurrencePicker";
import { DataTable, StatusPill, type DataColumn, type GroupDef, type PillTone, TOUCH_TARGET } from "@/components/ui/DataTable";
import { daysBetween, today } from "@/lib/day";

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
  is_template?: boolean | null;
  domain: string | null;
  source: string | null;
  source_ref: string | null;
  source_url: string | null;
  project_id: string | null;
  assignee: string | null;
  external_status: string | null;
};

type DomainOption = { value: string; label: string };

type ProjectOption = {
  id: string;
  title: string | null;
  slug: string | null;
  domain: string | null;
  client: string | null;
  sync_enabled: boolean | null;
  last_synced_at: string | null;
};

/** Short labels for the table; the edit form's select carries the long form. */
const DOMAIN_LABEL: Record<string, string> = {
  spirit: "Spirit",
  body: "Body",
  soul: "Soul",
  family: "Family",
  work: "Work",
};

/** Matrix order — God First → Health → Family → Impact — for grouping. */
const DOMAIN_ORDER = ["spirit", "body", "soul", "family", "work"];

type TaskAttachment = {
  id: string;
  scope_id: string;
  filename: string;
  created_at: string;
  size_bytes: number | null;
  mime_type: string | null;
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

/** A task as the table sees it: the project resolved to a name once. */
type Row = Task & { projectName: string | null };

function toDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/**
 * One vocabulary for "not done yet".
 *
 * The tasks table defaults to 'todo' and the reviews route writes 'todo', but
 * this screen used 'open' throughout. A new task therefore matched no bucket
 * and vanished, and ticking the circle wrote 'open' — a value nothing else
 * recognizes — so the task reappeared as soon as the list refetched. 'todo' is
 * canonical; 'open' and null are read as the same thing for anything already
 * written that way.
 */
function normalizeStatus(status: string | null | undefined): string {
  if (!status || status === "open") return "todo";
  return status;
}

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

/** The old screen's section order, kept as the Status grouping's order. */
const STATUS_RANK: Record<string, number> = { pinned: 0, todo: 1, in_progress: 2, blocked: 3, done: 4 };

const statusLabel = (task: Task) => STATUS_LABEL[normalizeStatus(task.status)] ?? normalizeStatus(task.status);

/**
 * The due day as 'YYYY-MM-DD'. Compared as strings against `today()` — never
 * through `new Date("2026-08-16")`, which is UTC midnight and therefore the
 * previous evening anywhere west of UTC, so a task due today read "Overdue".
 */
const dueDay = (task: Task) => (task.due_date ? task.due_date.slice(0, 10) : null);

function isOverdue(task: Task, todayIso: string) {
  const day = dueDay(task);
  return Boolean(day && day < todayIso && normalizeStatus(task.status) !== "done");
}

/** Red / yellow / green by meaning: done, off track, at risk. */
function statusTone(task: Task, todayIso: string): PillTone {
  const status = normalizeStatus(task.status);
  if (status === "done") return "green";
  if (status === "blocked" || isOverdue(task, todayIso)) return "red";
  const day = dueDay(task);
  if (day && daysBetween(todayIso, day) <= 2) return "yellow";
  if (status === "in_progress") return "blue";
  return "slate";
}

function formatDay(day: string, todayIso: string) {
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  const sameYear = day.slice(0, 4) === todayIso.slice(0, 4);
  return date.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

const isSynced = (task: Task) => Boolean(task.source && task.source !== "manual");

export default function TasksListClient({
  tasks,
  attachmentsByTask,
  categories,
  domains,
  initialDomain,
  initialProject,
  initialTaskId,
  projects,
  subtasks,
  links,
  noteLinks,
  notes,
}: {
  tasks: Task[];
  attachmentsByTask: Record<string, TaskAttachment[]>;
  categories: string[];
  domains: DomainOption[];
  /** From ?domain= — a single domain, a comma list, "none" or "all". */
  initialDomain: string;
  /** From ?project= — a project id, or "all". */
  initialProject: string;
  initialTaskId?: string | null;
  projects: ProjectOption[];
  subtasks: Subtask[];
  links: TaskLink[];
  noteLinks: TaskNoteLink[];
  notes: NoteOption[];
}) {
  const router = useRouter();
  const todayIso = today();
  /** All tasks, only recurring ones, or only templates. */
  const [view, setView] = useState<"all" | "recurring" | "templates">("all");
  // Done was a collapsed section on the old screen: a synced repo can close
  // hundreds of tasks, and they bury the ones still open. Hidden until asked.
  const [showDone, setShowDone] = useState(false);
  // The dashboard's matrix and the project pages link here with a slice
  // already chosen (?domain=, ?project=). Those arrive before the table does
  // and can be a comma list ("body,soul") or "none", which a column filter
  // cannot express — so they stay a pre-filter, shown as a chip to clear.
  const [domainFilter, setDomainFilter] = useState(initialDomain);
  const [projectFilter, setProjectFilter] = useState(initialProject);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  /** Optimistic status overrides, keyed by task id. */
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [editWhy, setEditWhy] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editRecurrence, setEditRecurrence] = useState("");
  const [editRecurrenceAnchor, setEditRecurrenceAnchor] = useState("");
  const [editTemplate, setEditTemplate] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newNoteId, setNewNoteId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [newPriority, setNewPriority] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newWhy, setNewWhy] = useState("");
  const [newTemplate, setNewTemplate] = useState(false);
  const attachmentsForSelected = selectedTask ? attachmentsByTask[selectedTask.id] || [] : [];
  const subtasksForSelected = selectedTask ? subtasks.filter((item) => item.task_id === selectedTask.id) : [];
  const linksForSelected = selectedTask ? links.filter((item) => item.task_id === selectedTask.id) : [];
  const noteLinksForSelected = selectedTask ? noteLinks.filter((item) => item.task_id === selectedTask.id) : [];

  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const rows: Row[] = useMemo(() => {
    return tasks
      .map((task) => (statusOverrides[task.id] ? { ...task, status: statusOverrides[task.id] } : task))
      .filter((task) => {
        if (domainFilter === "none") {
          if (task.domain) return false;
        } else if (domainFilter !== "all") {
          // A comma list, because the Health tile owns two domains.
          if (!task.domain || !domainFilter.split(",").includes(task.domain)) return false;
        }
        if (projectFilter !== "all" && task.project_id !== projectFilter) return false;
        if (view === "recurring" && !task.recurrence_rule) return false;
        if (view === "templates" && !task.is_template) return false;
        if (!showDone && normalizeStatus(task.status) === "done") return false;
        return true;
      })
      .map((task) => {
        const project = task.project_id ? projectById.get(task.project_id) : undefined;
        return { ...task, projectName: project ? project.title || project.slug : null };
      });
  }, [tasks, statusOverrides, domainFilter, projectFilter, view, showDone, projectById]);

  const doneCount = useMemo(
    () => tasks.filter((t) => normalizeStatus(statusOverrides[t.id] ?? t.status) === "done").length,
    [tasks, statusOverrides],
  );

  /**
   * Toggles done/open. Optimistic so the tick lands instantly — a checkbox
   * that waits on a round-trip feels broken — and rolled back if the write
   * fails, so the tick never claims something that did not save.
   */
  async function toggleDone(task: Task) {
    const next = normalizeStatus(task.status) === "done" ? "todo" : "done";
    setStatusOverrides((prev) => ({ ...prev, [task.id]: next }));
    setTogglingId(task.id);
    try {
      const body = new FormData();
      body.set("id", task.id);
      body.set("status", next);
      // Ask for JSON. Without this the route replies 307, fetch re-POSTs to
      // /tasks, and the 405 that comes back reads as a failed save.
      body.set("json", "1");
      const res = await fetch("/tasks/update", { method: "POST", body, redirect: "manual" });
      if (!res.ok) throw new Error("Save failed");
      // The override is deliberately NOT cleared here. router.refresh() is not
      // awaitable, so dropping it now would show the old status again until the
      // new server data lands — exactly the flash this was fixing. It is
      // overwritten by the next render carrying the same value.
      router.refresh();
    } catch {
      setStatusOverrides((prev) => {
        const copy = { ...prev };
        delete copy[task.id];
        return copy;
      });
    } finally {
      setTogglingId(null);
    }
  }

  /**
   * One field, saved from a click-to-edit cell, through the same route the
   * dialog uses: it checks the user, stamps `edited_at` and rolls a recurring
   * task forward on done. Throws on refusal so the cell reverts.
   */
  async function saveField(task: Task, field: string, value: string) {
    const body = new FormData();
    body.set("id", task.id);
    body.set(field, value);
    body.set("json", "1");
    const res = await fetch("/tasks/update", { method: "POST", body, redirect: "manual" });
    if (!res.ok) throw new Error("Save failed");
    router.refresh();
  }

  function openTask(task: Task) {
    setSelectedTask(task);
    setEditTitle(task.title);
    setEditStatus(normalizeStatus(task.status));
    setEditPriority(task.priority ? String(task.priority) : "");
    setEditDueDate(toDateInput(task.due_date));
    setEditCategory(task.category || "");
    setEditDomain(task.domain || "");
    setEditWhy(task.why || "");
    setEditRecurrence(task.recurrence_rule || "");
    setEditRecurrenceAnchor(toDateInput(task.recurrence_anchor));
    setEditTemplate(Boolean(task.is_template));
    setNewSubtaskTitle("");
    setNewLinkLabel("");
    setNewLinkUrl("");
    setNewNoteId("");
    (document.getElementById("task-detail-dialog") as HTMLDialogElement | null)?.showModal();
  }

  // `?task=<id>` — open that task's dialog on arrival.
  //
  // The briefs link every task they name so a row can be worked or closed
  // from the email. Landing on the list and leaving the reader to find the
  // row among two hundred is not a link to the task.
  //
  // Once only, tracked by a ref rather than by the id: re-running would
  // reopen the dialog every time the user closed it, which is worse than
  // not deep-linking at all. The filters are left alone deliberately — the
  // dialog is modal, so it shows whether or not the row is filtered out.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !initialTaskId) return;
    const target = tasks.find((task) => task.id === initialTaskId);
    if (!target) return;
    deepLinked.current = true;
    openTask(target);
  }, [initialTaskId, tasks]);

  const columns: DataColumn<Row>[] = [
    {
      key: "title",
      header: "Task",
      sortable: true,
      filter: "text",
      pinLeft: true,
      value: (t) => t.title,
      render: (t) => (
        <span className="flex items-center gap-1.5">
          {t.recurrence_rule && <Repeat className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Recurring" />}
          {/* Narrow on a phone so the pinned title leaves room to scroll the
              rest of the row past it. */}
          <span
            className={`block max-w-[10rem] truncate sm:max-w-[21rem] ${normalizeStatus(t.status) === "done" ? "text-slate-400 line-through" : ""}`}
            title={t.title}
          >
            {t.title}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      filter: "select",
      value: (t) => statusLabel(t),
      edit: {
        type: "select",
        value: (t) => normalizeStatus(t.status),
        options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
        save: (t, v) => saveField(t, "status", v),
      },
      render: (t) => (
        <span className="inline-flex items-center gap-1">
          <StatusPill tone={statusTone(t, todayIso)}>{statusLabel(t)}</StatusPill>
          {t.external_status === "gone" && <StatusPill tone="yellow">Gone from source</StatusPill>}
        </span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      sortable: true,
      filter: "select",
      value: (t) => (t.priority ? `P${t.priority}` : null),
      edit: {
        type: "select",
        value: (t) => (t.priority ? String(t.priority) : ""),
        options: ["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: `P${v}` })),
        allowEmpty: true,
        save: (t, v) => saveField(t, "priority", v),
      },
      render: (t) =>
        t.priority ? (
          <span className={t.priority === 1 ? "font-semibold text-slate-900" : "text-slate-600"}>P{t.priority}</span>
        ) : (
          <span className="text-slate-300">—</span>
        ),
    },
    {
      key: "due",
      header: "Due",
      sortable: true,
      filter: "daterange",
      value: (t) => dueDay(t),
      edit: { type: "date", value: (t) => dueDay(t) ?? "", save: (t, v) => saveField(t, "due_date", v) },
      render: (t) => {
        const day = dueDay(t);
        if (!day) return <span className="text-slate-300">—</span>;
        const overdue = isOverdue(t, todayIso);
        const soon = !overdue && normalizeStatus(t.status) !== "done" && daysBetween(todayIso, day) <= 2;
        return (
          <span className={`tabular-nums ${overdue ? "font-medium text-red-700" : soon ? "font-medium text-yellow-800" : ""}`}>
            {day === todayIso ? "Today" : formatDay(day, todayIso)}
          </span>
        );
      },
    },
    {
      key: "domain",
      header: "Domain",
      sortable: true,
      filter: "select",
      value: (t) => (t.domain ? (DOMAIN_LABEL[t.domain] ?? t.domain) : "Unclassified"),
      render: (t) =>
        t.domain ? DOMAIN_LABEL[t.domain] ?? t.domain : <span className="text-slate-400">Unclassified</span>,
    },
    {
      key: "project",
      header: "Project",
      sortable: true,
      filter: "select",
      value: (t) => t.projectName,
    },
    {
      key: "category",
      header: "Category",
      sortable: true,
      filter: "select",
      value: (t) => t.category,
    },
    {
      key: "source",
      header: "Source",
      sortable: true,
      filter: "select",
      // Provenance, so slate — blue is for things you act on.
      value: (t) => (isSynced(t) ? (t.source as string) : "Typed here"),
      render: (t) => (
        <span className="inline-flex items-center gap-1 text-slate-500">
          {isSynced(t) ? t.source : "Typed here"}
          {t.source_url && (
            <a
              className={`inline-flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-blue-50 ${TOUCH_TARGET}`}
              href={t.source_url}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              title="Open where this task is written"
              aria-label="Open where this task is written"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </span>
      ),
    },
    {
      key: "assignee",
      header: "Assignee",
      sortable: true,
      filter: "select",
      value: (t) => t.assignee,
    },
    {
      key: "actions",
      header: "",
      pinRight: true,
      width: "2.75rem",
      value: () => null,
      render: (t) => {
        const done = normalizeStatus(t.status) === "done";
        // A plain checkbox, sized like the text. The row itself opens the task.
        return (
          <input
            type="checkbox"
            checked={done}
            disabled={togglingId === t.id}
            onClick={(event) => event.stopPropagation()}
            onChange={() => void toggleDone(t)}
            aria-label={done ? `Mark ${t.title} not done` : `Mark ${t.title} done`}
            title={done ? "Mark not done" : "Mark done"}
            className="h-4 w-4 cursor-pointer accent-green-600 disabled:opacity-50"
          />
        );
      },
    },
  ];

  const groups: GroupDef<Row>[] = [
    {
      key: "status",
      label: "Status",
      // Pinned means "important", not "permanent" — a completed pinned task
      // drops into Done with everything else rather than sitting on top.
      of: (t) => {
        const status = normalizeStatus(t.status);
        if (t.priority === 1 && status !== "done") return { id: "pinned", label: "Pinned" };
        return { id: status, label: STATUS_LABEL[status] ?? status };
      },
      rank: (id) => STATUS_RANK[id] ?? 9,
    },
    {
      key: "domain",
      label: "Domain",
      of: (t) => (t.domain ? { id: t.domain, label: DOMAIN_LABEL[t.domain] ?? t.domain } : null),
      rank: (id) => {
        const i = DOMAIN_ORDER.indexOf(id);
        return i === -1 ? 99 : i;
      },
      emptyLabel: "Unclassified",
    },
    {
      key: "project",
      label: "Project",
      of: (t) => (t.project_id && t.projectName ? { id: t.project_id, label: t.projectName } : null),
      emptyLabel: "No project",
    },
    {
      key: "due",
      label: "Due",
      of: (t) => {
        const day = dueDay(t);
        if (!day) return null;
        if (isOverdue(t, todayIso)) return { id: "past", label: "Past due" };
        const days = daysBetween(todayIso, day);
        if (days <= 0) return { id: "today", label: "Today" };
        if (days <= 7) return { id: "week", label: "Next 7 days" };
        return { id: "later", label: "Later" };
      },
      rank: (id) => ["past", "today", "week", "later"].indexOf(id),
      emptyLabel: "No due date",
    },
  ];

  const domainChip =
    domainFilter === "all"
      ? null
      : domainFilter === "none"
        ? "Unclassified"
        : domainFilter === "body,soul"
          ? "Health — Body and Soul"
          : domainFilter
              .split(",")
              .map((d) => domains.find((o) => o.value === d)?.label ?? d)
              .join(", ");
  const projectChip =
    projectFilter === "all"
      ? null
      : (projectById.get(projectFilter)?.title ?? projectById.get(projectFilter)?.slug ?? "Unknown project");

  const chipClass =
    "inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 text-sm text-blue-800 hover:bg-blue-100";

  return (
    <div className="mt-4">
      <DataTable
        rows={rows}
        columns={columns}
        noun={["task", "tasks"]}
        searchPlaceholder="Search tasks…"
        searchText={(t) => [t.why, t.assignee].filter(Boolean).join(" ")}
        groups={groups}
        defaultGroup="status"
        groupAlert={(groupRows) => {
          const count = groupRows.filter((t) => isOverdue(t, todayIso)).length;
          return count ? { count, label: "overdue" } : null;
        }}
        rowClassName={(t) => (normalizeStatus(t.status) === "done" ? "text-slate-400" : "")}
        emptyState={
          <p className="text-sm text-slate-500">
            {view === "templates" ? "No templates yet." : view === "recurring" ? "No recurring tasks yet." : "No tasks here."}
          </p>
        }
        actions={
          <>
            {domainChip && (
              <button type="button" className={chipClass} onClick={() => setDomainFilter("all")} aria-label={`Clear domain filter ${domainChip}`}>
                {domainChip}
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            {projectChip && (
              <button type="button" className={chipClass} onClick={() => setProjectFilter("all")} aria-label={`Clear project filter ${projectChip}`}>
                {projectChip}
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <select
              aria-label="Which tasks"
              className="h-9 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-sm"
              value={view}
              onChange={(e) => setView(e.target.value as typeof view)}
            >
              <option value="all">All tasks</option>
              <option value="recurring">Recurring</option>
              <option value="templates">Templates</option>
            </select>
            <label className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
              Show done
              <span className="text-slate-400">{doneCount}</span>
            </label>
            <button
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-blue-700 px-3 text-sm font-medium text-white shadow-sm hover:bg-blue-800"
              type="button"
              onClick={() => (document.getElementById("new-task-dialog") as HTMLDialogElement | null)?.showModal()}
            >
              <Plus className="h-4 w-4" />
              New task
            </button>
          </>
        }
        onRowClick={(t) => openTask(t)}
      />

      <dialog
        id="task-detail-dialog"
        className="task-modal w-[92vw] max-w-3xl rounded-2xl border-2 border-slate-300 p-0 shadow-2xl"
      >
        {/* Padding and the sticky header's negative offsets move together —
            they're the same number expressed twice. */}
        <div className="max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-4 sm:p-6">
          <div className="sticky -top-4 z-10 -mx-4 -mt-4 mb-2 flex items-center justify-between border-b-2 border-slate-200 bg-white px-4 py-3 sm:-top-6 sm:-mx-6 sm:-mt-6 sm:px-6 sm:py-4">
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
              {/* min-w-0 on the children: a grid item defaults to
                  min-width:auto, so Safari's native date field — which has a
                  wide intrinsic size — stretched the track past the dialog
                  and pushed the form off the right edge. */}
              <div className="grid min-w-0 gap-3 md:grid-cols-2 [&>div]:min-w-0">
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
                    <option value="todo">to do</option>
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
                <div>
                  <label className="text-xs text-slate-500">Domain</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    name="domain"
                    value={editDomain}
                    onChange={(e) => setEditDomain(e.target.value)}
                  >
                    <option value="">Unclassified</option>
                    {domains.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
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

              <div className="rounded-xl border-2 border-slate-300 p-3">
                <RecurrencePicker key={selectedTask?.id ?? 'none'} defaultValue={editRecurrence} />
              </div>

              <div>
                <label className="text-xs text-slate-500">Description</label>
                <input type="hidden" name="why" value={editWhy} />
                <MarkdownEditor value={editWhy} onChange={setEditWhy} placeholder="Add details…" minHeight="96px" />
              </div>

              {/* min-w-0 on the children: a grid item defaults to
                  min-width:auto, so Safari's native date field — which has a
                  wide intrinsic size — stretched the track past the dialog
                  and pushed the form off the right edge. */}
              <div className="grid min-w-0 gap-3 md:grid-cols-2 [&>div]:min-w-0">

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

              {/* A bare checkbox is a ~13px target. min-h on the label gives
                  the whole row a thumb-sized hit area. */}
              <label className="inline-flex min-h-[44px] items-center gap-2 text-sm text-slate-500 sm:min-h-0 sm:text-xs">
                <input
                  type="checkbox"
                  name="is_template"
                  checked={editTemplate}
                  onChange={(e) => setEditTemplate(e.target.checked)}
                  className="h-5 w-5 sm:h-4 sm:w-4"
                />
                Save as template
              </label>
              <div>
                <button
                  className="min-h-[40px] rounded-full border border-slate-200 bg-white px-4 text-sm sm:min-h-0 sm:px-3 sm:py-1 sm:text-xs"
                  type="button"
                  onClick={() => {
                    setEditPriority(editPriority === "1" ? "" : "1");
                  }}
                >
                  {editPriority === "1" ? "Unpin" : "Pin"}
                </button>
              </div>

              {/* Save is the primary action and sits under the thumb on a
                  phone; Delete is destructive and gets pushed to the far
                  left rather than sitting next to it. */}
              <div className="flex items-center gap-2">
                <form action="/tasks/delete" method="post" data-toast="Task deleted">
                  <input type="hidden" name="id" value={selectedTask.id} />
                  <input type="hidden" name="redirect" value="/tasks" />
                  <button
                    className="min-h-[44px] rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm text-rose-700"
                    type="submit"
                  >
                    Delete
                  </button>
                </form>
                <button
                  className="ml-auto min-h-[44px] rounded-xl border border-slate-200 bg-white px-3 text-sm"
                  type="button"
                  onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
                >
                  Cancel
                </button>
                <button
                  className="min-h-[44px] rounded-xl bg-blue-700 px-5 text-sm font-medium text-white shadow-sm"
                  type="submit"
                >
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
                  <input type="hidden" name="redirect" value="/tasks" />
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
                      <input type="hidden" name="redirect" value="/tasks" />
                      <input className="flex-1 rounded border border-slate-200 px-2 py-1 text-xs" name="title" defaultValue={sub.title} />
                      <select className="rounded border border-slate-200 px-2 py-1 text-[10px]" name="status" defaultValue={normalizeStatus(sub.status)}>
                        <option value="todo">to do</option>
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
                  <input type="hidden" name="redirect" value="/tasks" />
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
                        <input type="hidden" name="redirect" value="/tasks" />
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
                  <input type="hidden" name="redirect" value="/tasks" />
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
                          <input type="hidden" name="redirect" value="/tasks" />
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

      <dialog
        id="new-task-dialog"
        className="task-modal w-[92vw] max-w-lg rounded-2xl border-2 border-slate-300 p-0 shadow-2xl"
      >
        <div className="max-h-[85vh] overflow-y-auto rounded-2xl bg-white">
          <div className="sticky top-0 z-10 border-b-2 border-slate-200 bg-white px-5 py-3">
            <h3 className="text-base font-semibold">New Task</h3>
          </div>
          {/* Scheduling sits above the description on purpose. Repeat used to
              follow a tall editor, which pushed it — and the Create button —
              off the bottom of the screen, so it looked as though recurring
              tasks were not supported at all. */}
          <form className="grid gap-3 px-5 py-4" action="/tasks/new" method="post" data-toast="Task added">
            <div>
              <label className="text-xs font-semibold text-slate-500" htmlFor="nt-title">Title</label>
              <input
                id="nt-title"
                className="mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                name="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid min-w-0 gap-3 sm:grid-cols-3 [&>div]:min-w-0">
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-slate-500" htmlFor="nt-domain">
                  Domain
                </label>
                {/* Asked for on creation, because a task with no domain is
                    invisible to the priority matrix — and the matrix is the
                    whole point of the frame. */}
                <select
                  id="nt-domain"
                  className="mt-1 mb-3 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  name="domain"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  required
                >
                  <option value="">Choose one…</option>
                  {domains.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
                <label className="text-xs font-semibold text-slate-500" htmlFor="nt-category">Category</label>
                <select
                  id="nt-category"
                  className="mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  name="category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  <option value="">None</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500" htmlFor="nt-priority">Priority</label>
                <input
                  id="nt-priority"
                  className="mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                  name="priority"
                  type="number"
                  min="1"
                  max="5"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500" htmlFor="nt-due">Due Date</label>
              <input
                id="nt-due"
                className="mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none"
                name="due_date"
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
              />
            </div>

            <div className="rounded-xl border-2 border-slate-300 p-3">
              <RecurrencePicker />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500">Description</label>
              <input type="hidden" name="why" value={newWhy} />
              <MarkdownEditor value={newWhy} onChange={setNewWhy} placeholder="Optional details…" minHeight="72px" />
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" name="is_template" checked={newTemplate} onChange={(e) => setNewTemplate(e.target.checked)} />
              Save as template
            </label>

            <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-end gap-2 border-t-2 border-slate-200 bg-white px-5 py-3">
              <button
                className="rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm"
                type="button"
                onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
              >
                Cancel
              </button>
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-800" type="submit">
                Create Task
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </div>
  );
}
