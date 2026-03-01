"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Grid, List, Calendar as CalendarIcon, Plus } from "lucide-react";
import MonthView from "./calendar/MonthView";
import WeekView from "./calendar/WeekView";
import DayView from "./calendar/DayView";
import CalendarFilters from "./calendar/CalendarFilters";
import ScheduleWorkoutModal from "./calendar/ScheduleWorkoutModal";
import EditPlannedWorkoutModal from "./calendar/EditPlannedWorkoutModal";
import { CalendarView, toISODate, startOfWeek, EventFilter, createDefaultFilter } from "@/lib/calendar/date-utils";

type CalendarEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  event_type: string | null;
  domain: string | null;
  alignment_tag: string | null;
  recurrence_rule: string | null;
  recurrence_until: string | null;
  goal_id: string | null;
  task_id: string | null;
  note_id: string | null;
  review_id: string | null;
  notes: string | null;
  completed: boolean;
  _baseId?: string;
  _recurring?: boolean;
};

type Option = { id: string; title: string };
type ReviewOption = { id: string; period_start: string };

function toDateInput(value: string) {
  // IMPORTANT: calendar UI groups by *local* date (via new Date(start_at)), so the edit form
  // should also show the local date. Using YYYY-MM-DD slicing on an ISO timestamptz string
  // can be off by one day for evening events (UTC rolls over).
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeInput(value: string) {
  // IMPORTANT: start_at/end_at are stored as timestamptz (UTC). We want to show the user's
  // local time (ET) in the edit form, so always parse as Date and use local hours/minutes.
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  // Fallback for non-ISO strings.
  const s = String(value || '');
  const m = s.match(/(\d{2}:\d{2})/);
  return m ? m[1] : '';
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

type WorkoutTemplate = {
  id: string;
  name: string;
  type: string;
  split_type: string | null;
  notes: string | null;
};

export default function CalendarClient({
  events,
  initialDate,
  goals,
  tasks,
  notes,
  reviews,
  templates,
}: {
  events: CalendarEvent[];
  initialDate: string;
  goals: Option[];
  tasks: Option[];
  notes: Option[];
  reviews: ReviewOption[];
  templates: WorkoutTemplate[];
}) {
  const [view, setView] = useState<CalendarView>('day');
  const todayStr = toISODate(new Date());
  const [selectedDate, setSelectedDate] = useState(initialDate || todayStr);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [editingIsRecurring, setEditingIsRecurring] = useState(false);
  const [filters, setFilters] = useState<EventFilter>(createDefaultFilter());
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleModalDate, setScheduleModalDate] = useState(initialDate);

  const [plannedEditOpen, setPlannedEditOpen] = useState(false);
  const [plannedEditId, setPlannedEditId] = useState<string | null>(null);
  const [plannedEditTitle, setPlannedEditTitle] = useState('');
  const [plannedEditDate, setPlannedEditDate] = useState(initialDate);
  const [plannedEditTime, setPlannedEditTime] = useState('09:00');

  // Filter events based on active filters
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Event type filter
      if (filters.eventTypes.size > 0 && !filters.eventTypes.has(event.event_type || '')) {
        return false;
      }

      // Domain filter
      if (filters.domains.size > 0 && !filters.domains.has(event.domain || '')) {
        return false;
      }

      // Show completed filter
      if (!filters.showCompleted && event.completed) {
        return false;
      }

      // Date range filter
      if (filters.dateRange) {
        const eventDate = toDateInput(event.start_at);
        if (eventDate < filters.dateRange.start || eventDate > filters.dateRange.end) {
          return false;
        }
      }

      return true;
    });
  }, [events, filters]);

  const handleNavigation = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setSelectedDate(toISODate(new Date()));
    }
    // MonthView, WeekView, DayView handle their own date state
  };

  const handleDateClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setView('day');
  };

  const handleEventClick = (event: CalendarEvent) => {
    // Planned workouts are source-of-truth in planned_workouts (calendar_events are derived).
    // So we edit via planned_workouts PATCH, not the generic calendar event form.
    if (event.alignment_tag && event.alignment_tag.startsWith('planned_workout:')) {
      const plannedId = event.alignment_tag.split(':')[1];
      if (plannedId) {
        setPlannedEditId(plannedId);
        setPlannedEditTitle(event.title || 'Workout');
        setPlannedEditDate(toDateInput(event.start_at));
        setPlannedEditTime(toTimeInput(event.start_at) || '09:00');
        setPlannedEditOpen(true);
        return;
      }
    }

    const base = event._baseId ? events.find((e) => e.id === event._baseId) : event;
    setEditing(base || event);
    setEditingIsRecurring(Boolean(event._recurring));
    (document.getElementById("edit-event-dialog") as HTMLDialogElement | null)?.showModal();
  };

  const handleScheduleWorkout = () => {
    setScheduleModalDate(selectedDate);
    setIsScheduleModalOpen(true);
  };

  const handleWorkoutScheduled = () => {
    // Refresh the page to show new event
    window.location.reload();
  };

  // Avoid JS Date timezone shifting when parsing YYYY-MM-DD (treated as UTC).
  // Use a midday local time anchor so week calculations are stable.
  const weekStartDate = toISODate(startOfWeek(new Date(`${selectedDate || todayStr}T12:00:00`)));

  return (
    <div className="mt-6 grid gap-6">
      {/* View Switcher & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button
              onClick={() => setView('month')}
              className={`
                flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors
                ${view === 'month' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}
              `}
            >
              <Grid className="h-4 w-4" />
              Month
            </button>
            <button
              onClick={() => setView('week')}
              className={`
                flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors
                ${view === 'week' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}
              `}
            >
              <List className="h-4 w-4" />
              Week
            </button>
            <button
              onClick={() => setView('day')}
              className={`
                flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors
                ${view === 'day' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'}
              `}
            >
              <CalendarIcon className="h-4 w-4" />
              Day
            </button>
          </div>

          {view === 'day' && (
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          )}
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-2">
          <CalendarFilters filters={filters} onFiltersChange={setFilters} />
          <button
            onClick={handleScheduleWorkout}
            className="flex h-9 items-center gap-2 rounded-lg bg-blue-700 px-3 text-sm font-medium text-white hover:bg-blue-800"
          >
            <Plus className="h-4 w-4" />
            Schedule Workout
          </button>
        </div>
      </div>

      {/* View Components */}
      {view === 'month' && (
        <MonthView
          events={filteredEvents as any}
          selectedDate={selectedDate}
          onDateClick={handleDateClick}
          onNavigate={handleNavigation}
          onEventClick={handleEventClick as any}
        />
      )}

      {view === 'week' && (
        <WeekView
          events={filteredEvents as any}
          weekStart={weekStartDate}
          onEventClick={handleEventClick as any}
          onNavigate={handleNavigation}
        />
      )}

      {view === 'day' && (
        <DayView
          events={filteredEvents as any}
          selectedDate={selectedDate}
          onEventClick={handleEventClick as any}
          onNavigate={handleNavigation}
        />
      )}

      {/* Schedule Workout Modal */}
      <ScheduleWorkoutModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        defaultDate={scheduleModalDate}
        templates={templates}
        onSuccess={handleWorkoutScheduled}
      />

      {/* Planned workout editor */}
      <EditPlannedWorkoutModal
        isOpen={plannedEditOpen}
        onClose={() => setPlannedEditOpen(false)}
        plannedWorkoutId={plannedEditId}
        initialTitle={plannedEditTitle}
        initialDate={plannedEditDate}
        initialTime={plannedEditTime}
        onSaved={() => window.location.reload()}
      />

      {/* Add Event Form */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Add Event</h3>
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
      </div>


      <dialog id="edit-event-dialog" className="w-[92vw] max-w-xl rounded-2xl border border-slate-200 p-0 shadow-xl">
        <div className="rounded-2xl bg-white p-6">
          <h3 className="text-lg font-semibold">Edit Event</h3>
          {editing && (() => {
            const isPlannedWorkout = Boolean(editing.alignment_tag && editing.alignment_tag.startsWith('planned_workout:'));
            return (
            <form className="mt-4 grid gap-3" action="/calendar/events/update" method="post" data-progress="true" data-toast="Event updated">
              <input type="hidden" name="id" value={editing.id} />
              <input type="hidden" name="redirect" value={`/calendar?date=${selectedDate}`} />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
                  name="date"
                  type="date"
                  defaultValue={toDateInput(editing.start_at)}
                  required
                />
              </div>
              {editingIsRecurring && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  This is a recurring event. Edits apply to the series.
                </div>
              )}
              {isPlannedWorkout && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  This is a scheduled workout. Saving will update the underlying planned workout (and the calendar will resync automatically).
                </div>
              )}
              <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" defaultValue={editing.title} required />

              {isPlannedWorkout ? (
                <input type="hidden" name="event_type" value="Workout" />
              ) : (
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="event_type" defaultValue={editing.event_type || ""}>
                  <option>Monthly Review</option>
                  <option>Weekly Planning</option>
                  <option>Daily Anchor</option>
                  <option>Sermon/Teaching</option>
                  <option>Client Work</option>
                  <option>Family</option>
                  <option>Health/Training</option>
                  <option>Workout</option>
                </select>
              )}

              <div className="grid gap-2 md:grid-cols-2">
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="start_at" type="time" defaultValue={toTimeInput(editing.start_at)} required />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="end_at" type="time" defaultValue={toTimeInput(editing.end_at)} required />
              </div>
              {!isPlannedWorkout && (
                <>
                  <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="recurrence_rule" defaultValue={editing.recurrence_rule || ""} placeholder="Recurrence (e.g., weekly)" />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Recurrence until (optional)</label>
                    <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2" name="recurrence_until" type="date" defaultValue={editing.recurrence_until ? toDateInput(editing.recurrence_until) : ""} />
                  </div>
                  <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="expand_count" type="number" min="0" placeholder="Expand next N occurrences (optional)" />
                </>
              )}

              {isPlannedWorkout ? (
                <input type="hidden" name="alignment_tag" value={editing.alignment_tag || ''} />
              ) : (
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="alignment_tag" defaultValue={editing.alignment_tag || ""}>
                  <option value="">Alignment tag</option>
                  <option>God First</option>
                  <option>Health</option>
                  <option>Family</option>
                  <option>Impact</option>
                </select>
              )}
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
            );
          })()}
        </div>
      </dialog>
    </div>
  );
}
