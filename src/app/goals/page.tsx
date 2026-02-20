import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: cycles } = await supabase
    .from("goal_cycles")
    .select("id,title,start_date,end_date,review_week_start,review_week_end")
    .order("start_date", { ascending: false });

  const { data: goals } = await supabase
    .from("goals")
    .select("id,title,domain,description_md,status,cycle_id")
    .order("created_at", { ascending: false });

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id,title")
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: goalTasks } = await supabase
    .from("goal_tasks")
    .select("goal_id,task_id,task:tasks(id,title)");

  const linkedTasks = (goalId: string) =>
    (goalTasks || [])
      .filter((link) => link.goal_id === goalId)
      .map((link) => link.task);

  return (
    <main className="pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Goals</h1>
        <p className="mt-1 text-sm text-slate-500">
          12-week cycles with Spirit, Soul, and Body alignment.
        </p>
      </div>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">Create 12-Week Cycle</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" action="/goals/cycles" method="post">
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Cycle title" required />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="start_date" type="date" required />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="end_date" type="date" required />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="review_week_start" type="date" placeholder="Review week start" />
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="review_week_end" type="date" placeholder="Review week end" />
          <textarea className="md:col-span-2 min-h-[120px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm" name="notes_md" placeholder="Cycle notes (markdown)" />
          <button className="md:col-span-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Save Cycle
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <h2 className="text-base font-semibold">Add Goal</h2>
        <form className="mt-3 grid gap-3 md:grid-cols-2" action="/goals/new" method="post">
          <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Goal title" required />
          <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="domain" defaultValue="Spirit">
            <option>Spirit</option>
            <option>Soul</option>
            <option>Body</option>
            <option>Impact</option>
            <option>Family</option>
            <option>Health</option>
          </select>
          <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="cycle_id" defaultValue="">
            <option value="">No cycle</option>
            {(cycles || []).map((cycle) => (
              <option key={cycle.id} value={cycle.id}>{cycle.title}</option>
            ))}
          </select>
          <textarea className="md:col-span-2 min-h-[120px] rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm" name="description_md" placeholder="Goal details (markdown)" />
          <button className="md:col-span-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Save Goal
          </button>
        </form>
      </section>

      <section className="mt-6 grid gap-4">
        {(cycles || []).map((cycle) => (
          <div key={cycle.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <div className="text-sm uppercase tracking-widest text-slate-500">Cycle</div>
            <div className="text-lg font-semibold">{cycle.title}</div>
            <div className="mt-1 text-xs text-slate-500">
              {cycle.start_date} → {cycle.end_date}
            </div>
            <div className="mt-3 grid gap-2">
              {(goals || []).filter((goal) => goal.cycle_id === cycle.id).map((goal) => (
                <div key={goal.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                  <div className="text-sm font-medium">{goal.title}</div>
                  <div className="text-xs text-slate-500">{goal.domain} · {goal.status}</div>
                  {goal.description_md && (
                    <div className="mt-2 text-xs whitespace-pre-line text-slate-600">{goal.description_md}</div>
                  )}
                  <div className="mt-2 text-xs text-slate-500">
                    Linked tasks: {(linkedTasks(goal.id) || []).map((task) => task.title).join(", ") || "None"}
                  </div>
                  <form className="mt-2 flex gap-2" action="/goals/link" method="post">
                    <input type="hidden" name="goal_id" value={goal.id} />
                    <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="task_id" defaultValue="">
                      <option value="">Link task</option>
                      {(tasks || []).map((task) => (
                        <option key={task.id} value={task.id}>{task.title}</option>
                      ))}
                    </select>
                    <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="submit">
                      Link
                    </button>
                  </form>
                </div>
              ))}
              {(goals || []).filter((goal) => goal.cycle_id === cycle.id).length === 0 && (
                <div className="text-xs text-slate-500">No goals yet for this cycle.</div>
              )}
            </div>
          </div>
        ))}

        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <div className="text-sm uppercase tracking-widest text-slate-500">Unassigned Goals</div>
          <div className="mt-3 grid gap-2">
            {(goals || []).filter((goal) => !goal.cycle_id).map((goal) => (
              <div key={goal.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-sm font-medium">{goal.title}</div>
                <div className="text-xs text-slate-500">{goal.domain} · {goal.status}</div>
                {goal.description_md && (
                  <div className="mt-2 text-xs whitespace-pre-line text-slate-600">{goal.description_md}</div>
                )}
                <div className="mt-2 text-xs text-slate-500">
                  Linked tasks: {(linkedTasks(goal.id) || []).map((task) => task.title).join(", ") || "None"}
                </div>
                <form className="mt-2 flex gap-2" action="/goals/link" method="post">
                  <input type="hidden" name="goal_id" value={goal.id} />
                  <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="task_id" defaultValue="">
                    <option value="">Link task</option>
                    {(tasks || []).map((task) => (
                      <option key={task.id} value={task.id}>{task.title}</option>
                    ))}
                  </select>
                  <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="submit">
                    Link
                  </button>
                </form>
              </div>
            ))}
            {(goals || []).filter((goal) => !goal.cycle_id).length === 0 && (
              <div className="text-xs text-slate-500">No unassigned goals.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
