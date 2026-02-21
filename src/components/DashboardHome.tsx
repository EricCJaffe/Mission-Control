import { supabaseServer } from "@/lib/supabase/server";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function alignmentLabel(status?: string | null, score?: number | null, flags?: string[] | null) {
  if (status) return status;
  const hasFlags = (flags || []).length > 0;
  if (score !== null && score !== undefined) {
    if (score < 4 || hasFlags) return "off-track";
    if (score < 6) return "drifting";
    return "aligned";
  }
  return "unknown";
}

export default async function DashboardHome() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;

  const today = new Date();
  const todayIso = formatDate(today);
  const start = startOfDay(today).toISOString();
  const end = endOfDay(today).toISOString();

  const [
    scoresResult,
    alignmentResult,
    prioritiesResult,
    anchorsResult,
    eventsResult,
    tasksResult,
    personaResult,
    sopChecksResult,
  ] = await Promise.all([
    supabase
      .from("dashboard_scores")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("monthly_reviews")
      .select("id,alignment_score,alignment_status,drift_flags,period_start")
      .order("period_start", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("daily_priorities")
      .select("id,rank,domain,title,task_id")
      .eq("date", todayIso)
      .order("rank", { ascending: true }),
    supabase
      .from("daily_anchors")
      .select("id,prayer,training,family_touchpoint")
      .eq("date", todayIso)
      .maybeSingle(),
    supabase
      .from("calendar_events")
      .select("id,title,start_at,end_at,event_type,domain")
      .gte("start_at", start)
      .lte("start_at", end)
      .order("start_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("id,title,status,due_date,priority")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("notes")
      .select("content_md")
      .eq("title", "persona")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sop_checks")
      .select("id,step,is_done,due_date")
      .eq("is_done", false)
      .order("created_at", { ascending: true })
      .limit(10),
  ]);

  const scoreRow = scoresResult.data;
  const spiritScore = scoreRow?.spirit ?? "";
  const soulScore = scoreRow?.soul ?? "";
  const bodyScore = scoreRow?.body ?? "";

  const alignment = alignmentResult.data;
  const alignmentStatus = alignmentLabel(
    alignment?.alignment_status,
    alignment?.alignment_score,
    alignment?.drift_flags || []
  );

  const priorities = prioritiesResult.data || [];
  const anchors = anchorsResult.data;
  const events = eventsResult.data || [];

  const tasks = tasksResult.data || [];
  const mustDo = tasks.filter((t) => t.due_date === todayIso);
  const optional = tasks.filter((t) => t.due_date !== todayIso).slice(0, 5);
  const overdue = tasks.filter((t) => t.due_date && t.due_date < todayIso);

  const pendingSops = sopChecksResult.data || [];
  const sopOverdue = pendingSops.filter((sop) => sop.due_date && sop.due_date < todayIso);

  const personaContent = personaResult.data?.content_md || "";
  const personaExcerpt = personaContent.split("\n").slice(0, 12).join("\n").trim();

  const statusStyles: Record<string, string> = {
    aligned: "bg-blue-700 text-white",
    drifting: "bg-amber-500 text-white",
    "off-track": "bg-rose-600 text-white",
    unknown: "bg-slate-400 text-white",
  };

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Mission alignment for Spirit, Soul, and Body.
          </p>
        </div>
        <div className="text-sm text-slate-500">
          Signed in as: <span className="font-medium text-slate-900">{user.email}</span>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-blue-800">
              Alignment Status
            </div>
            <div className="mt-2 text-2xl font-semibold">Monthly Alignment</div>
            <div className="mt-1 text-sm text-slate-500">
              Based on the latest review score and drift flags.
            </div>
          </div>
          <div className={`rounded-full px-4 py-2 text-sm font-semibold ${statusStyles[alignmentStatus]}`}>
            {alignmentStatus === "aligned" && "Aligned"}
            {alignmentStatus === "drifting" && "Drifting"}
            {alignmentStatus === "off-track" && "Off-track"}
            {alignmentStatus === "unknown" && "No data yet"}
          </div>
        </div>

        <form className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto]" action="/dashboard/alignment" method="post">
          <input type="hidden" name="period_start" value={todayIso.slice(0, 7) + "-01"} />
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            name="alignment_score"
            type="number"
            min="0"
            max="10"
            placeholder="Alignment score (0-10)"
            defaultValue={alignment?.alignment_score ?? ""}
          />
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            name="alignment_status"
            defaultValue={alignment?.alignment_status ?? ""}
          >
            <option value="">Auto</option>
            <option value="aligned">Aligned</option>
            <option value="drifting">Drifting</option>
            <option value="off-track">Off-track</option>
          </select>
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            name="drift_flags"
            placeholder="Drift flags (comma-separated)"
            defaultValue={(alignment?.drift_flags || []).join(", ")}
          />
          <button className="md:col-span-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Update Alignment
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-blue-800">
              Chief of Staff Briefing
            </div>
            <div className="mt-2 text-2xl font-semibold">Today’s Focus</div>
            <div className="mt-1 text-sm text-slate-500">
              What’s behind, what’s due, and what restores alignment.
            </div>
          </div>
          <a className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" href="/reviews/new">
            Run Monthly Survey
          </a>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold">Behind</div>
            <div className="mt-2 text-xs text-slate-500">
              Overdue tasks: {overdue.length}
            </div>
            <div className="text-xs text-slate-500">
              SOP steps pending: {pendingSops.length}
            </div>
            <div className="text-xs text-slate-500">
              SOP steps overdue: {sopOverdue.length}
            </div>
            {(overdue.length > 0 || sopOverdue.length > 0) ? (
              <div className="mt-2 text-xs text-slate-600">
                Clear one overdue task and one SOP step today.
              </div>
            ) : (
              <div className="mt-2 text-xs text-slate-600">No behind signals.</div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold">Must-Do Today</div>
            <div className="mt-2 text-xs text-slate-500">
              {mustDo.length} tasks due today
            </div>
            <div className="mt-2 text-xs text-slate-600">
              Protect these before optional tasks.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-sm font-semibold">Anchors</div>
            <div className="mt-2 text-xs text-slate-500">
              Prayer, training, and family touchpoint.
            </div>
            <div className="mt-2 text-xs text-slate-600">
              Check anchors to keep the day aligned.
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-blue-800">
              Mission, Vision, Values
            </div>
            <div className="mt-2 text-2xl font-semibold">Guideposts</div>
            <div className="mt-1 text-sm text-slate-500">
              Pulled from your Persona note. Keep this visible to prevent drift.
            </div>
          </div>
          <a className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" href="/knowledge">
            Update Persona
          </a>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 whitespace-pre-line">
          {personaExcerpt || "No persona note found yet. Add it in Knowledge."}
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm md:col-span-1">
          <h2 className="text-sm uppercase tracking-widest text-slate-500">Priority Matrix</h2>
          <ul className="mt-4 grid gap-2 text-sm">
            <li className="rounded-xl border border-slate-200 bg-white px-3 py-2">1. God First</li>
            <li className="rounded-xl border border-slate-200 bg-white px-3 py-2">2. Health</li>
            <li className="rounded-xl border border-slate-200 bg-white px-3 py-2">3. Family</li>
            <li className="rounded-xl border border-slate-200 bg-white px-3 py-2">4. Impact</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-widest text-slate-500">Today</h2>
            <div className="text-xs text-slate-500">{today.toDateString()}</div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="font-semibold">Top 3 Priorities</div>
              <div className="mt-2 grid gap-2 text-sm">
                {priorities.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <div>
                      <div className="font-medium">#{item.rank} {item.title}</div>
                      <div className="text-xs text-slate-500">{item.domain}</div>
                    </div>
                  </div>
                ))}
                {priorities.length === 0 && (
                  <div className="text-xs text-slate-500">No priorities set for today.</div>
                )}
              </div>

              <form className="mt-3 grid gap-2" action="/dashboard/priorities" method="post">
                <input type="hidden" name="date" value={todayIso} />
                <div className="grid grid-cols-[auto_1fr] gap-2">
                  <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="rank" defaultValue="1">
                    <option value="1">#1</option>
                    <option value="2">#2</option>
                    <option value="3">#3</option>
                  </select>
                  <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="title" placeholder="Priority title" />
                </div>
                <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="domain" defaultValue="God First">
                  <option>God First</option>
                  <option>Health</option>
                  <option>Family</option>
                  <option>Impact</option>
                </select>
                <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="submit">
                  Save Priority
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="font-semibold">Calendar (Day View)</div>
              <div className="mt-2 grid gap-2 text-sm">
                {events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="font-medium">{event.title}</div>
                    <div className="text-xs text-slate-500">
                      {formatTime(event.start_at)} - {formatTime(event.end_at)} · {event.event_type}
                    </div>
                  </div>
                ))}
                {events.length === 0 && (
                  <div className="text-xs text-slate-500">No events scheduled today.</div>
                )}
              </div>

              <form className="mt-3 grid gap-2" action="/dashboard/events" method="post">
                <input type="hidden" name="date" value={todayIso} />
                <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="title" placeholder="Event title" required />
                <div className="grid grid-cols-2 gap-2">
                  <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="start_at" type="time" required />
                  <input className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="end_at" type="time" required />
                </div>
                <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs" name="event_type" defaultValue="Daily Anchor">
                  <option>Monthly Review</option>
                  <option>Weekly Planning</option>
                  <option>Daily Anchor</option>
                  <option>Sermon/Teaching</option>
                  <option>Client Work</option>
                  <option>Family</option>
                  <option>Health/Training</option>
                </select>
                <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="submit">
                  Add Event
                </button>
              </form>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="font-semibold">Tasks (Must-do)</div>
              <div className="mt-2 grid gap-2 text-sm">
                {mustDo.map((task) => (
                  <div key={task.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="font-medium">{task.title}</div>
                    <div className="text-xs text-slate-500">Due today</div>
                  </div>
                ))}
                {mustDo.length === 0 && (
                  <div className="text-xs text-slate-500">No must-do tasks due today.</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="font-semibold">Tasks (Optional)</div>
              <div className="mt-2 grid gap-2 text-sm">
                {optional.map((task) => (
                  <div key={task.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <div className="font-medium">{task.title}</div>
                    <div className="text-xs text-slate-500">No due date today</div>
                  </div>
                ))}
                {optional.length === 0 && (
                  <div className="text-xs text-slate-500">No optional tasks queued.</div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="font-semibold">Habit Anchors</div>
            <form className="mt-3 grid gap-2 text-sm" action="/dashboard/anchors" method="post">
              <input type="hidden" name="date" value={todayIso} />
              <label className="flex items-center gap-2">
                <input type="checkbox" name="prayer" defaultChecked={anchors?.prayer ?? false} />
                Prayer / Scripture
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="training" defaultChecked={anchors?.training ?? false} />
                Training
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="family_touchpoint" defaultChecked={anchors?.family_touchpoint ?? false} />
                Family Touchpoint
              </label>
              <button className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-medium text-white" type="submit">
                Save Anchors
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <form className="grid gap-4 md:grid-cols-3" action="/dashboard/update" method="post">
          <input type="hidden" name="score_id" value={scoreRow?.id || ""} />

          <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <h2 className="font-semibold">Spirit</h2>
            <p className="mt-1 text-sm text-slate-500">Mission/vision/values alignment.</p>
            <div className="mt-4 grid gap-3">
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="spirit"
                type="number"
                min="0"
                max="10"
                placeholder="Score (0-10)"
                defaultValue={spiritScore}
              />
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="spirit_alignment"
                placeholder="Alignment note"
                defaultValue={scoreRow?.spirit_alignment ?? ""}
              />
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="spirit_action"
                placeholder="Quick action"
                defaultValue={scoreRow?.spirit_action ?? ""}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <h2 className="font-semibold">Soul</h2>
            <p className="mt-1 text-sm text-slate-500">Relationships, emotions, inner life.</p>
            <div className="mt-4 grid gap-3">
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="soul"
                type="number"
                min="0"
                max="10"
                placeholder="Score (0-10)"
                defaultValue={soulScore}
              />
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="soul_alignment"
                placeholder="Alignment note"
                defaultValue={scoreRow?.soul_alignment ?? ""}
              />
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="soul_action"
                placeholder="Quick action"
                defaultValue={scoreRow?.soul_action ?? ""}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <h2 className="font-semibold">Body</h2>
            <p className="mt-1 text-sm text-slate-500">Health, energy, action capacity.</p>
            <div className="mt-4 grid gap-3">
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="body"
                type="number"
                min="0"
                max="10"
                placeholder="Score (0-10)"
                defaultValue={bodyScore}
              />
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="body_alignment"
                placeholder="Alignment note"
                defaultValue={scoreRow?.body_alignment ?? ""}
              />
              <input
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                name="body_action"
                placeholder="Quick action"
                defaultValue={scoreRow?.body_action ?? ""}
              />
            </div>
          </div>

          <button className="md:col-span-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
            Save Alignment Snapshot
          </button>
        </form>
      </section>
    </main>
  );
}
