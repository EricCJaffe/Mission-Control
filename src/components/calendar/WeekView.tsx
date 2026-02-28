'use client';

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import Link from 'next/link';
import {
  getWeekGrid,
  toISODate,
  isToday,
  formatDate,
  parseWorkoutTag,
  addWeeks,
} from '@/lib/calendar/date-utils';
import { useState } from 'react';

// Get color classes based on workout type
function getWorkoutTypeColors(title: string): { bg: string; text: string; border: string; hoverBg: string } {
  const lowerTitle = title.toLowerCase();

  if (lowerTitle.includes('cardio')) {
    return {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
      hoverBg: 'hover:bg-red-100',
    };
  }

  if (lowerTitle.includes('strength')) {
    return {
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
      hoverBg: 'hover:bg-purple-100',
    };
  }

  if (lowerTitle.includes('hybrid')) {
    return {
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-200',
      hoverBg: 'hover:bg-orange-100',
    };
  }

  // Default for other workout types
  return {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    hoverBg: 'hover:bg-green-100',
  };
}

type CalendarEvent = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  event_type: string;
  domain: string;
  alignment_tag: string | null;
  notes: string | null;
  completed: boolean;
};

type WeekViewProps = {
  events: CalendarEvent[];
  weekStart: string; // ISO date of week start (Monday)
  onEventClick: (event: CalendarEvent) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
};

export default function WeekView({
  events,
  weekStart,
  onEventClick,
  onNavigate,
}: WeekViewProps) {
  const [currentWeekStart, setCurrentWeekStart] = useState(new Date(weekStart));
  const weekGrid = getWeekGrid(currentWeekStart);

  // Group events by date and hour
  const eventsByDateHour = new Map<string, Map<number, CalendarEvent[]>>();
  events.forEach((event) => {
    const eventDate = toISODate(new Date(event.start_at));
    const eventHour = new Date(event.start_at).getHours();

    if (!eventsByDateHour.has(eventDate)) {
      eventsByDateHour.set(eventDate, new Map());
    }
    const hourMap = eventsByDateHour.get(eventDate)!;
    const existing = hourMap.get(eventHour) || [];
    hourMap.set(eventHour, [...existing, event]);
  });

  const handlePrev = () => {
    const newWeekStart = addWeeks(currentWeekStart, -1);
    setCurrentWeekStart(newWeekStart);
    onNavigate('prev');
  };

  const handleNext = () => {
    const newWeekStart = addWeeks(currentWeekStart, 1);
    setCurrentWeekStart(newWeekStart);
    onNavigate('next');
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentWeekStart(today);
    onNavigate('today');
  };

  // Week range label (e.g., "Feb 23 - Mar 1, 2026")
  const weekEndDate = weekGrid[6];
  const weekLabel = `${formatDate(weekGrid[0])} - ${formatDate(weekEndDate, 'long')}`;

  // Hours to display (6 AM - 11 PM)
  const hours = Array.from({ length: 18 }, (_, i) => i + 6);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {/* Header with navigation */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">{weekLabel}</h2>
        <div className="flex gap-2">
          <button
            onClick={handleToday}
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Calendar className="h-4 w-4" />
            Today
          </button>
          <button
            onClick={handlePrev}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handleNext}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Week grid with time slots */}
      <div className="max-h-[600px] overflow-y-auto">
        <div className="grid grid-cols-8 gap-px bg-slate-200">
          {/* Time column header (empty) */}
          <div className="bg-white p-2 text-center text-xs font-medium text-slate-500">
            Time
          </div>

          {/* Day headers */}
          {weekGrid.map((date, index) => {
            const isTodayDate = isToday(date);
            return (
              <div
                key={index}
                className={`
                  bg-white p-2 text-center
                  ${isTodayDate ? 'bg-blue-50' : ''}
                `}
              >
                <div className="text-xs font-medium text-slate-500">
                  {date.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div
                  className={`
                    text-sm font-semibold
                    ${isTodayDate ? 'flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white mx-auto' : 'text-slate-900'}
                  `}
                >
                  {date.getDate()}
                </div>
              </div>
            );
          })}

          {/* Time slots and events */}
          {hours.map((hour) => (
            <div key={hour} className="contents">
              {/* Time label */}
              <div className="bg-white p-2 text-right text-xs text-slate-500">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>

              {/* Event cells for each day */}
              {weekGrid.map((date, dayIndex) => {
                const dateStr = toISODate(date);
                const hourMap = eventsByDateHour.get(dateStr);
                const hourEvents = hourMap?.get(hour) || [];

                return (
                  <div
                    key={dayIndex}
                    className="min-h-[60px] bg-white p-1"
                  >
                    {hourEvents.length > 0 && (
                      <div className="space-y-1">
                        {/* Show max 3 events, then "+N more" */}
                        {hourEvents.slice(0, 3).map((event) => {
                          const workoutData = parseWorkoutTag(event.alignment_tag);
                          const isLogged = workoutData?.isLogged || false;
                          const isPlanned = workoutData?.isPlanned || false;
                          const colors = workoutData ? getWorkoutTypeColors(event.title) : null;

                          // Logged workout - link to workout history
                          if (isLogged && workoutData?.loggedWorkoutId && colors) {
                            return (
                              <Link
                                key={event.id}
                                href={`/fitness/history/${workoutData.loggedWorkoutId}`}
                                className={`block w-full truncate rounded px-2 py-1 text-left text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border} ${colors.hoverBg}`}
                                title={event.title}
                              >
                                {event.title} ✓
                              </Link>
                            );
                          }

                          // Planned workout - allow edit from calendar, keep a way to start
                          if (isPlanned && colors && workoutData?.plannedWorkoutId) {
                            return (
                              <div key={event.id} className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onEventClick(event)}
                                  className={`flex-1 truncate rounded px-2 py-1 text-left text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border} ${colors.hoverBg} opacity-75`}
                                  title={`${event.title} — click to edit`}
                                >
                                  {event.title}
                                </button>
                                <Link
                                  href={`/fitness/log?planned_workout_id=${workoutData.plannedWorkoutId}`}
                                  className="shrink-0 rounded border border-slate-200 bg-white px-1.5 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
                                  title="Start workout"
                                >
                                  Start
                                </Link>
                              </div>
                            );
                          }

                          // Regular event - open edit modal
                          return (
                            <button
                              key={event.id}
                              onClick={() => onEventClick(event)}
                              className="w-full truncate rounded px-2 py-1 text-left text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100"
                              title={event.title}
                            >
                              {event.title}
                            </button>
                          );
                        })}

                        {hourEvents.length > 3 && (
                          <div className="text-xs text-slate-500 px-2">
                            +{hourEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
