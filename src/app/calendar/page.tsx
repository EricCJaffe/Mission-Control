import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default async function CalendarPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: events, error } = await supabase
    .from("calendar_events")
    .select("id,title,start_at,end_at,event_type,domain,notes,recurrence_rule,recurrence_until,alignment_tag")
    .order("start_at", { ascending: true })
    .limit(200);

  const { data: goals } = await supabase.from("goals").select("id,title").order("created_at", { ascending: false }).limit(50);
  const { data: tasks } = await supabase.from("tasks").select("id,title").order("created_at", { ascending: false }).limit(50);
  const { data: notes } = await supabase.from("notes").select("id,title").order("created_at", { ascending: false }).limit(50);
  const { data: reviews } = await supabase.from("monthly_reviews").select("id,period_start").order("period_start", { ascending: false }).limit(12);

  return (
    <main className="pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">Supabase-only calendar events.</p>
      </div>

      <form className="mt-6 grid gap-3 rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm md:grid-cols-2" action="/dashboard/events" method="post">
        <input type="hidden" name="date" value={new Date().toISOString().slice(0, 10)} />
        <input type="hidden" name="redirect" value="calendar" />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" placeholder="Event title" required />
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="event_type" defaultValue="Daily Anchor">
          <option>Monthly Review</option>
          <option>Weekly Planning</option>
          <option>Daily Anchor</option>
          <option>Sermon/Teaching</option>
          <option>Client Work</option>
          <option>Family</option>
          <option>Health/Training</option>
        </select>
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="start_at" type="time" required />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="end_at" type="time" required />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="recurrence_rule" placeholder="Recurrence (e.g., weekly)" />
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="recurrence_until" type="date" />
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="alignment_tag" defaultValue="">
          <option value="">Alignment tag</option>
          <option>God First</option>
          <option>Health</option>
          <option>Family</option>
          <option>Impact</option>
        </select>
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="goal_id" defaultValue="">
          <option value="">Link goal</option>
          {(goals || []).map((goal) => (
            <option key={goal.id} value={goal.id}>{goal.title}</option>
          ))}
        </select>
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="task_id" defaultValue="">
          <option value="">Link task</option>
          {(tasks || []).map((task) => (
            <option key={task.id} value={task.id}>{task.title}</option>
          ))}
        </select>
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="note_id" defaultValue="">
          <option value="">Link note</option>
          {(notes || []).map((note) => (
            <option key={note.id} value={note.id}>{note.title}</option>
          ))}
        </select>
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="review_id" defaultValue="">
          <option value="">Link review</option>
          {(reviews || []).map((review) => (
            <option key={review.id} value={review.id}>{review.period_start}</option>
          ))}
        </select>
        <button className="md:col-span-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
          Add Event
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading events: {error.message}
        </div>
      )}

      <div className="mt-6 grid gap-3">
        {(events || []).map((event) => (
          <div key={event.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
            <div className="font-semibold">{event.title}</div>
            <div className="mt-1 text-xs text-slate-500">
              {formatTime(event.start_at)} → {formatTime(event.end_at)} · {event.event_type}
            </div>
            {event.alignment_tag && (
              <div className="mt-1 text-xs text-slate-500">Alignment: {event.alignment_tag}</div>
            )}
            {event.recurrence_rule && (
              <div className="mt-1 text-xs text-slate-500">Recurs: {event.recurrence_rule} until {event.recurrence_until || "n/a"}</div>
            )}
          </div>
        ))}
        {events && events.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
            No events yet. Add your first one above.
          </div>
        )}
      </div>
    </main>
  );
}
