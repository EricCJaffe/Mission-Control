import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: taskTemplates } = await supabase
    .from("tasks")
    .select("id,title,why,category,priority,recurrence_rule,recurrence_anchor")
    .eq("is_template", true)
    .order("created_at", { ascending: false });

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Templates</h1>
        <p className="mt-1 text-sm text-slate-500">Reusable task and review templates.</p>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Task Templates</h2>
        <div className="mt-4 grid gap-3">
          {(taskTemplates || []).map((task) => (
            <div key={task.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{task.title}</div>
                  {task.category && <div className="mt-1 text-xs text-slate-500">{task.category}</div>}
                  {task.why && <div className="mt-2 text-xs text-slate-600">{task.why}</div>}
                </div>
                <form action="/tasks/new" method="post" data-toast="Task created">
                  <input type="hidden" name="title" value={task.title} />
                  <input type="hidden" name="priority" value={task.priority ?? ""} />
                  <input type="hidden" name="category" value={task.category ?? ""} />
                  <input type="hidden" name="why" value={task.why ?? ""} />
                  <input type="hidden" name="recurrence_rule" value={task.recurrence_rule ?? ""} />
                  <input type="hidden" name="recurrence_anchor" value={task.recurrence_anchor ?? ""} />
                  <input type="hidden" name="redirect" value="/tasks" />
                  <button className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs" type="submit">
                    Use Template
                  </button>
                </form>
              </div>
            </div>
          ))}
          {(!taskTemplates || taskTemplates.length === 0) && (
            <div className="text-xs text-slate-500">No task templates yet. Save a task as a template to see it here.</div>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold">Review Templates</h2>
        <div className="mt-4 grid gap-2 text-sm">
          <a className="rounded-xl border border-slate-200 bg-white px-3 py-2" href="/reviews/quarterly">
            Quarterly Review Template
          </a>
          <a className="rounded-xl border border-slate-200 bg-white px-3 py-2" href="/reviews/annual">
            Annual Review Template
          </a>
        </div>
      </section>
    </main>
  );
}
