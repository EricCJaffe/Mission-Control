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

  const attachmentsByTask = (taskAttachments || []).reduce<Record<string, NonNullable<typeof taskAttachments>>>((acc, file) => {
    if (!acc[file.scope_id]) acc[file.scope_id] = [];
    acc[file.scope_id].push(file);
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

      <form className="mt-6 grid gap-3 rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm sm:grid-cols-[1fr_auto_auto]" action="/tasks/new" method="post">
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

      <div className="mt-6 grid gap-4">
        {(tasks || []).map((task) => (
          <div key={task.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-base font-semibold">{task.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Status: {task.status || "unspecified"} · Priority: {task.priority || "unspecified"} · {formatDueDate(task.due_date)}
                </div>
                {(task.book_id || task.chapter_id) && (
                  <div className="mt-1 text-xs text-slate-500">
                    Linked: {task.book_id ? `Book ${task.book_id}` : ""} {task.chapter_id ? `Chapter ${task.chapter_id}` : ""}
                  </div>
                )}
                {task.category && (
                  <div className="mt-1 text-xs text-slate-500">Category: {task.category}</div>
                )}
                {task.why && (
                  <div className="mt-1 text-xs text-slate-500">Why: {task.why}</div>
                )}
                {task.recurrence_rule && (
                  <div className="mt-1 text-xs text-slate-500">
                    Recurrence: {task.recurrence_rule} (anchor {task.recurrence_anchor || "n/a"})
                  </div>
                )}
              </div>

              <form action="/tasks/update" method="post" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={task.id} />
                <input
                  className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  name="status"
                  defaultValue={task.status || ""}
                  placeholder="Status"
                />
                <input
                  className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
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
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  name="category"
                  defaultValue={task.category || ""}
                  placeholder="Category"
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  name="why"
                  defaultValue={task.why || ""}
                  placeholder="Why"
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  name="recurrence_rule"
                  defaultValue={task.recurrence_rule || ""}
                  placeholder="Recurrence"
                />
                <input
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  name="recurrence_anchor"
                  type="date"
                  defaultValue={task.recurrence_anchor || ""}
                />
                <button className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm" type="submit">
                  Update
                </button>
              </form>
            </div>

            <form className="mt-3 grid gap-2" action="/attachments/upload" method="post" encType="multipart/form-data">
              <input type="hidden" name="scope_type" value="task" />
              <input type="hidden" name="scope_id" value={task.id} />
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs" name="file" type="file" />
              <button className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-medium text-white shadow-sm" type="submit">
                Upload Attachment
              </button>
            </form>

            <div className="mt-3 grid gap-2 text-xs">
              {(attachmentsByTask[task.id] || []).map((file) => (
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
