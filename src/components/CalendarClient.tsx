"use client";

import { useMemo, useState } from "react";

type CalendarEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  event_type: string | null;
  alignment_tag: string | null;
  recurrence_rule: string | null;
  recurrence_until: string | null;
  goal_id: string | null;
  task_id: string | null;
  note_id: string | null;
  review_id: string | null;
};

type Option = { id: string; title: string };
type ReviewOption = { id: string; period_start: string };

function toDateInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(11, 16);
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function normalizeRule(rule: string | null) {
  const lower = (rule || "").toLowerCase();
  if (lower.includes("daily") || lower.includes("every day")) return "daily";
  if (lower.includes("weekly") || lower.includes("every week")) return "weekly";
  if (lower.includes("monthly") || lower.includes("every month")) return "monthly";
  return "";
}

function buildOccurrence(base: CalendarEvent, dateStr: string) {
  const startTime = toTimeInput(base.start_at);
  const endTime = toTimeInput(base.end_at);
  const startAt = `${dateStr}T${startTime}`;
  const endAt = `${dateStr}T${endTime}`;
  return {
    ...base,
    start_at: startAt,
    end_at: endAt,
    id: `${base.id}-${dateStr}`,
    _baseId: base.id,
    _recurring: true,
  };
}

function shouldIncludeOnDate(base: CalendarEvent, dateStr: string) {
  const baseDate = toDateInput(base.start_at);
  if (baseDate === dateStr) return true;
  const rule = normalizeRule(base.recurrence_rule);
  if (!rule) return false;
  if (base.recurrence_until && base.recurrence_until < dateStr) return false;
  const baseDateObj = new Date(baseDate);
  const targetDateObj = new Date(dateStr);
  const diffDays = Math.floor((targetDateObj.getTime() - baseDateObj.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return false;
  if (rule === "daily") return true;
  if (rule === "weekly") return diffDays % 7 === 0;
  if (rule === "monthly") return baseDateObj.getDate() === targetDateObj.getDate();
  return false;
}

function upcomingOccurrences(events: CalendarEvent[], fromDate: string, days = 14) {
  const results: any[] = [];
  const baseDateObj = new Date(fromDate);
  for (let i = 0; i <= days; i++) {
    const target = new Date(baseDateObj);
    target.setDate(baseDateObj.getDate() + i);
    const dateStr = toDateInput(target.toISOString());
    events.forEach((event) => {
      if (shouldIncludeOnDate(event, dateStr)) {
        results.push(buildOccurrence(event, dateStr));
      }
    });
  }
  return results.sort((a, b) => (a.start_at < b.start_at ? -1 : 1));
}

export default function CalendarClient({
  events,
  initialDate,
  goals,
  tasks,
  notes,
  reviews,
}: {
  events: CalendarEvent[];
  initialDate: string;
  goals: Option[];
  tasks: Option[];
  notes: Option[];
  reviews: ReviewOption[];
}) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [editingIsRecurring, setEditingIsRecurring] = useState(false);

  const dayEvents = useMemo(() => {
    const items: any[] = [];
    const seen = new Set<string>();
    events.forEach((event) => {
      if (shouldIncludeOnDate(event, selectedDate)) {
        const occurrence = buildOccurrence(event, selectedDate);
        if (!seen.has(occurrence.id)) {
          items.push(occurrence);
          seen.add(occurrence.id);
        }
      }
    });
    return items;
  }, [events, selectedDate]);

  const upcoming = useMemo(() => {
    return upcomingOccurrences(events, selectedDate, 14).filter(
      (event) => toDateInput(event.start_at) !== selectedDate
    ).slice(0, 10);
  }, [events, selectedDate]);

  return (
    <div className="mt-6 grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-500">Day view</label>
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <form
        className="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm md:grid-cols-2"
        action="/dashboard/events"
        method="post"
        data-progress="true"
        data-toast="Event added"
      >
        <input type="hidden" name="date" value={selectedDate} />
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
          {goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.title}
            </option>
          ))}
        </select>
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="task_id" defaultValue="">
          <option value="">Link task</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>
              {task.title}
            </option>
          ))}
        </select>
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="note_id" defaultValue="">
          <option value="">Link note</option>
          {notes.map((note) => (
            <option key={note.id} value={note.id}>
              {note.title}
            </option>
          ))}
        </select>
        <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="review_id" defaultValue="">
          <option value="">Link review</option>
          {reviews.map((review) => (
            <option key={review.id} value={review.id}>
              {review.period_start}
            </option>
          ))}
        </select>
        <button className="md:col-span-2 rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
          Add Event
        </button>
      </form>

      <section className="grid gap-3">
        <div className="text-sm font-semibold">Day Schedule</div>
        {dayEvents.map((event) => (
          <div key={event.id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{event.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatTime(event.start_at)} → {formatTime(event.end_at)} · {event.event_type || "Event"}
                </div>
                {event.alignment_tag && (
                  <div className="mt-1 text-xs text-slate-500">Alignment: {event.alignment_tag}</div>
                )}
                {event.recurrence_rule && (
                  <div className="mt-1 text-xs text-slate-500">
                    Recurs: {event.recurrence_rule} until {event.recurrence_until || "n/a"}
                  </div>
                )}
              </div>
              <button
                className="rounded-full border border-slate-200 px-3 py-1 text-xs"
                type="button"
                onClick={() => {
                  const base = event._baseId ? events.find((e) => e.id === event._baseId) : event;
                  setEditing(base || event);
                  setEditingIsRecurring(Boolean(event._recurring));
                  (document.getElementById("edit-event-dialog") as HTMLDialogElement | null)?.showModal();
                }}
              >
                Edit
              </button>
            </div>
          </div>
        ))}
        {dayEvents.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
            No events for this day.
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="text-sm font-semibold">Upcoming</div>
        {upcoming.map((event) => (
          <div key={event.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <div className="font-semibold">{event.title}</div>
            <div className="mt-1 text-xs text-slate-500">
              {formatTime(event.start_at)} → {formatTime(event.end_at)} · {event.event_type || "Event"}
            </div>
          </div>
        ))}
        {upcoming.length === 0 && <div className="text-xs text-slate-500">No upcoming events.</div>}
      </section>

      <dialog id="edit-event-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Edit Event</h3>
          {editing && (
            <form className="mt-4 grid gap-3" action="/calendar/events/update" method="post" data-progress="true" data-toast="Event updated">
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="date" value={toDateInput(editing.start_at)} />
              <input type="hidden" name="redirect" value={`/calendar?date=${selectedDate}`} />
              {editingIsRecurring && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  This is a recurring event. Edits apply to the series.
                </div>
              )}
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" defaultValue={editing.title} required />
              <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="event_type" defaultValue={editing.event_type || ""}>
                <option>Monthly Review</option>
                <option>Weekly Planning</option>
                <option>Daily Anchor</option>
                <option>Sermon/Teaching</option>
                <option>Client Work</option>
                <option>Family</option>
                <option>Health/Training</option>
              </select>
              <div className="grid gap-2 md:grid-cols-2">
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="start_at" type="time" defaultValue={toTimeInput(editing.start_at)} required />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="end_at" type="time" defaultValue={toTimeInput(editing.end_at)} required />
              </div>
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="recurrence_rule" defaultValue={editing.recurrence_rule || ""} placeholder="Recurrence (e.g., weekly)" />
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="recurrence_until" type="date" defaultValue={editing.recurrence_until ? toDateInput(editing.recurrence_until) : ""} />
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="expand_count" type="number" min="0" placeholder="Expand next N occurrences (optional)" />
              <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="alignment_tag" defaultValue={editing.alignment_tag || ""}>
                <option value="">Alignment tag</option>
                <option>God First</option>
                <option>Health</option>
                <option>Family</option>
                <option>Impact</option>
              </select>
              <div className="grid gap-2 md:grid-cols-2">
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="goal_id" defaultValue={editing.goal_id || ""}>
                  <option value="">Link goal</option>
                  {goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.title}
                    </option>
                  ))}
                </select>
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="task_id" defaultValue={editing.task_id || ""}>
                  <option value="">Link task</option>
                  {tasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="note_id" defaultValue={editing.note_id || ""}>
                  <option value="">Link note</option>
                  {notes.map((note) => (
                    <option key={note.id} value={note.id}>
                      {note.title}
                    </option>
                  ))}
                </select>
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="review_id" defaultValue={editing.review_id || ""}>
                  <option value="">Link review</option>
                  {reviews.map((review) => (
                    <option key={review.id} value={review.id}>
                      {review.period_start}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <form action="/calendar/events/delete" method="post" data-toast="Event deleted">
                  <input type="hidden" name="id" value={editing.id} />
                  <input type="hidden" name="redirect" value={`/calendar?date=${selectedDate}`} />
                  <button className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700" type="submit">
                    Delete
                  </button>
                </form>
                <button
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  type="button"
                  onClick={(event) => (event.currentTarget.closest("dialog") as HTMLDialogElement)?.close()}
                >
                  Cancel
                </button>
                <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                  Save
                </button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </div>
  );
}
