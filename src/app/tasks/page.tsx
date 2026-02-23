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
    .select("id,title,status,priority,due_date,created_at,category,why,recurrence_rule,recurrence_anchor,book_id,chapter_id,is_template")
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

  const { data: subtasks } = taskIds.length
    ? await supabase
        .from("task_subtasks")
        .select("id,task_id,title,status")
        .in("task_id", taskIds)
    : { data: [] };

  const { data: links } = taskIds.length
    ? await supabase
        .from("task_links")
        .select("id,task_id,label,url")
        .in("task_id", taskIds)
    : { data: [] };

  const { data: noteLinks } = taskIds.length
    ? await supabase
        .from("task_note_links")
        .select("id,task_id,note_id")
        .in("task_id", taskIds)
    : { data: [] };

  const { data: notes } = await supabase
    .from("notes")
    .select("id,title")
    .order("created_at", { ascending: false });

  return (
    <main className="pt-4 md:pt-8">
      <div className="mb-4">
        <h1 className="text-3xl font-semibold">Tasks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage your tasks and assignments.
        </p>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading tasks: {error.message}
        </div>
      )}

      <TasksListClient
        tasks={tasks || []}
        attachmentsByTask={attachmentsByTask}
        categories={CATEGORIES}
        subtasks={subtasks || []}
        links={links || []}
        noteLinks={noteLinks || []}
        notes={notes || []}
      />
    </main>
  );
}
