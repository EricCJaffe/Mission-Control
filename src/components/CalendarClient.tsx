"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Grid, List, Calendar as CalendarIcon, Plus } from "lucide-react";
import MonthView from "./calendar/MonthView";
import WeekView from "./calendar/WeekView";
import DayView from "./calendar/DayView";
import CalendarFilters from "./calendar/CalendarFilters";
import ScheduleWorkoutModal from "./calendar/ScheduleWorkoutModal";
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

type WorkoutTemplate = {
  id: string;
  name: string;
  workout_type: string;
  description: string | null;
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
  const [view, setView] = useState<CalendarView>('month');
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [editingIsRecurring, setEditingIsRecurring] = useState(false);
  const [filters, setFilters] = useState<EventFilter>(createDefaultFilter());
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [scheduleModalDate, setScheduleModalDate] = useState(initialDate);

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

  const weekStartDate = toISODate(startOfWeek(new Date(selectedDate)));

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
