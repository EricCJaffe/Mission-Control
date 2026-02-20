import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatDueDate(value: string | null) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function toDateInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default async function TasksPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id,title,status,priority,due_date,created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Capture the next actions, then update status and priority as you go.
        </p>
      </div>

      <form className="mt-6 grid gap-3 rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto]" action="/tasks/new" method="post">
        <input
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
          name="title"
          placeholder="New task title…"
          required
        />
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

      <div className="mt-6 grid gap-4">
        {(tasks || []).map((task) => (
          <div key={task.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-base font-semibold">{task.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Status: {task.status || "unspecified"} · Priority: {task.priority || "unspecified"} · {formatDueDate(task.due_date)}
                </div>
              </div>

              <form action="/tasks/update" method="post" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={task.id} />
                <input
                  className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  name="status"
                  defaultValue={task.status || ""}
                  placeholder="Status"
                />
                <input
                  className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  name="priority"
                  type="number"
                  min="1"
                  max="5"
                  defaultValue={task.priority || ""}
                  placeholder="Priority"
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  name="due_date"
                  type="date"
                  defaultValue={toDateInput(task.due_date)}
                />
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm" type="submit">
                  Update
                </button>
              </form>
            </div>
          </div>
        ))}

        {tasks && tasks.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
            No tasks yet. Add your first action above.
          </div>
        )}
      </div>
    </main>
  );
}
