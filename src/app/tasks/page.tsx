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

/*
 * The five domains, in matrix order: God First → Health → Family → Impact.
 * Kept beside CATEGORIES rather than replacing it — category is the older,
 * free-text grouping and 36 tasks still rely on it.
 */
const DOMAINS = [
  { value: "spirit", label: "Spirit — God First" },
  { value: "body", label: "Body — Health" },
  { value: "soul", label: "Soul — Health" },
  { value: "family", label: "Family" },
  { value: "work", label: "Work — Impact" },
];

const CATEGORIES = [
  "God First",
  "Health",
  "Family",
  "Impact / Clients",
  "Admin",
  "Writing / Content",
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  // The dashboard's priority matrix links here with its own slice already
  // chosen — a tile you click should land on that tile's tasks, not on all 206.
  const { domain: initialDomain } = await searchParams;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: tasks, error } = await supabase
    .from("tasks")
    // One literal string, not a concatenation: supabase-js infers the row type
    // from the select text, and a `+` between two halves erases it back to
    // GenericStringError.
    .select("id,title,status,priority,due_date,created_at,category,why,recurrence_rule,recurrence_anchor,book_id,chapter_id,is_template,domain,source,source_ref,source_url,project_id,assignee,external_status")
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

  // Projects carry the slug the harvester syncs under, so a synced task can
  // say which repo it came from rather than showing a bare uuid.
  const { data: projects } = await supabase
    .from("projects")
    .select("id,title,slug,domain,client,sync_enabled,last_synced_at")
    .order("title", { ascending: true });

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
        domains={DOMAINS}
        initialDomain={initialDomain ?? "all"}
        projects={projects || []}
        subtasks={subtasks || []}
        links={links || []}
        noteLinks={noteLinks || []}
        notes={notes || []}
      />
    </main>
  );
}
