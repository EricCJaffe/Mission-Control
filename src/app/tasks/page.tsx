import { supabaseServer } from "@/lib/supabase/server";
import TasksListClient from "@/components/TasksListClient";

export const dynamic = "force-dynamic";

type TaskAttachment = {
  id: string;
  scope_id: string;
  filename: string;
  created_at: string;
  size_bytes: number | null;
  mime_type: string | null;
};

const CATEGORIES = [
  "God First",
  "Health",
  "Family",
  "Impact / Clients",
  "Admin",
  "Writing / Content",
];

export default async function TasksPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id,title,status,priority,due_date,created_at,category,why,recurrence_rule,recurrence_anchor,book_id,chapter_id")
    .order("created_at", { ascending: false });

  const taskIds = (tasks || []).map((task) => task.id);
  const { data: taskAttachments } = taskIds.length
    ? await supabase
        .from("attachments")
        .select("id,scope_id,filename,created_at,size_bytes,mime_type")
        .eq("scope_type", "task")
        .in("scope_id", taskIds)
    : { data: [] };

  const attachmentsByTask = (taskAttachments || []).reduce<Record<string, TaskAttachment[]>>((acc, file) => {
    if (!acc[file.scope_id]) acc[file.scope_id] = [];
    acc[file.scope_id].push(file as TaskAttachment);
    return acc;
  }, {});

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Capture the next actions, then update status and priority as you go.
        </p>
      </div>

      <form className="mt-6 grid gap-3 rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto]" action="/tasks/new" method="post" data-toast="Task added">
        <input
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
          name="title"
          placeholder="New task title…"
          required
        />
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="category" defaultValue="">
          <option value="">Category</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          name="priority"
          type="number"
          min="1"
          max="5"
          placeholder="Priority (1-5)"
        />
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          name="due_date"
          type="date"
        />
        <input
          className="sm:col-span-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          name="why"
          placeholder="Why this matters (alignment)"
        />
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          name="recurrence_rule"
          placeholder="Recurrence (e.g., weekly)"
        />
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          name="recurrence_anchor"
          type="date"
        />
        <button
          className="sm:col-span-3 rounded-xl bg-blue-700 text-white px-4 py-2 text-sm font-medium shadow-sm"
          type="submit"
        >
          Add Task
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading tasks: {error.message}
        </div>
      )}

      <TasksListClient tasks={tasks || []} attachmentsByTask={attachmentsByTask} categories={CATEGORIES} />
    </main>
  );
}
