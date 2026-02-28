'use client';

import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import Link from 'next/link';
import {
  addDays,
  toISODate,
  formatDate,
  formatTime,
  isToday,
  parseWorkoutTag,
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

type DayViewProps = {
  events: CalendarEvent[];
  selectedDate: string; // ISO date string
  onEventClick: (event: CalendarEvent) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
};

export default function DayView({
  events,
  selectedDate,
  onEventClick,
  onNavigate,
}: DayViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date(selectedDate));
  const dateStr = toISODate(currentDate);
  const isTodayDate = isToday(currentDate);

  // Group events by hour, separating all-day events
  const eventsByHour = new Map<number, CalendarEvent[]>();
  const allDayEvents: CalendarEvent[] = [];

  events.forEach((event) => {
    const eventDate = toISODate(new Date(event.start_at));
    if (eventDate === dateStr) {
      const startDate = new Date(event.start_at);
      const endDate = new Date(event.end_at);

      // Check if this is an all-day event (same date for start/end, no specific time)
      const isAllDay =
        startDate.getHours() === 0 &&
        startDate.getMinutes() === 0 &&
        endDate.getHours() === 0 &&
        endDate.getMinutes() === 0;

      if (isAllDay) {
        allDayEvents.push(event);
      } else {
        const eventHour = startDate.getHours();
        const existing = eventsByHour.get(eventHour) || [];
        eventsByHour.set(eventHour, [...existing, event]);
      }
    }
  });

  const handlePrev = () => {
    const newDate = addDays(currentDate, -1);
    setCurrentDate(newDate);
    onNavigate('prev');
  };

  const handleNext = () => {
    const newDate = addDays(currentDate, 1);
    setCurrentDate(newDate);
    onNavigate('next');
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    onNavigate('today');
  };

  // Hours to display (0-23)
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {/* Header with navigation */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {formatDate(currentDate, 'long')}
          </h2>
          <p className="text-sm text-slate-500">
            {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
            {isTodayDate && ' • Today'}
          </p>
        </div>
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
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handleNext}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* All-Day Events */}
      {allDayEvents.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-xs font-medium text-slate-500">All Day</div>
          {allDayEvents.map((event) => {
            const workoutData = parseWorkoutTag(event.alignment_tag);
            const isLogged = workoutData?.isLogged || false;
            const isPlanned = workoutData?.isPlanned || false;
            const colors = workoutData ? getWorkoutTypeColors(event.title) : null;

            return (
              <div
                key={event.id}
                className={`
                  rounded-lg border p-2
                  ${colors ? `${colors.bg} ${colors.border}` : 'bg-white border-slate-200'}
                `}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    {isLogged && workoutData?.loggedWorkoutId ? (
                      <Link
                        href={`/fitness/history/${workoutData.loggedWorkoutId}`}
                        className={`font-medium ${colors?.text || 'text-green-700'} hover:underline`}
                      >
                        {event.title} ✓
                      </Link>
                    ) : isPlanned ? (
                      <Link
                        href="/fitness/plans"
                        className={`font-medium ${colors?.text || 'text-blue-700'} hover:underline opacity-75`}
                      >
                        {event.title}
                      </Link>
                    ) : (
                      <button
                        onClick={() => onEventClick(event)}
                        className="font-medium text-slate-900 hover:text-blue-700 text-left"
                      >
                        {event.title}
                      </button>
                    )}
                    <div className="mt-0.5 text-xs text-slate-600">
                      {event.event_type && <span>{event.event_type}</span>}
                      {event.domain && !isLogged && !isPlanned && (
                        <span> · {event.domain}</span>
                      )}
                    </div>
                  </div>
                  {!isLogged && !isPlanned && (
                    <button
                      onClick={() => onEventClick(event)}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="max-h-[600px] overflow-y-auto">
        <div className="space-y-0">
          {hours.map((hour) => {
            const hourEvents = eventsByHour.get(hour) || [];
            const hourLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`;

            return (
              <div key={hour} className="flex gap-3 border-t border-slate-100 py-3 first:border-t-0">
                {/* Time label */}
                <div className="w-20 flex-shrink-0 pt-1 text-right text-sm font-medium text-slate-500">
                  {hourLabel}
                </div>

                {/* Events at this hour */}
                <div className="flex-1 space-y-2">
                  {hourEvents.length > 0 ? (
                    hourEvents.map((event) => {
                      const workoutData = parseWorkoutTag(event.alignment_tag);
                      const isLogged = workoutData?.isLogged || false;
                      const isPlanned = workoutData?.isPlanned || false;
                      const colors = workoutData ? getWorkoutTypeColors(event.title) : null;

                      return (
                        <div
                          key={event.id}
                          className={`
                            rounded-lg border p-3
                            ${colors ? `${colors.bg} ${colors.border}` : 'bg-white border-slate-200'}
                          `}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              {isLogged && workoutData?.loggedWorkoutId ? (
                                <Link
                                  href={`/fitness/history/${workoutData.loggedWorkoutId}`}
                                  className={`font-semibold ${colors?.text || 'text-green-700'} hover:underline`}
                                >
                                  {event.title} ✓
                                </Link>
                              ) : isPlanned ? (
                                <Link
                                  href="/fitness/plans"
                                  className={`font-semibold ${colors?.text || 'text-blue-700'} hover:underline opacity-75`}
                                >
                                  {event.title}
                                </Link>
                              ) : (
                                <button
                                  onClick={() => onEventClick(event)}
                                  className="font-semibold text-slate-900 hover:text-blue-700 text-left"
                                >
                                  {event.title}
                                </button>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                <span>{formatTime(new Date(event.start_at))}</span>
                                <span>→</span>
                                <span>{formatTime(new Date(event.end_at))}</span>
                                {event.event_type && (
                                  <>
                                    <span>·</span>
                                    <span>{event.event_type}</span>
                                  </>
                                )}
                                {event.domain && !isLogged && !isPlanned && (
                                  <>
                                    <span>·</span>
                                    <span>{event.domain}</span>
                                  </>
                                )}
                              </div>
                              {event.notes && (
                                <p className="mt-2 text-sm text-slate-600">{event.notes}</p>
                              )}
                            </div>
                            {!isLogged && !isPlanned && (
                              <button
                                onClick={() => onEventClick(event)}
                                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="h-8" /> // Empty space to maintain grid
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
          <p className="text-sm text-slate-500">No events for this day.</p>
          <p className="mt-1 text-xs text-slate-400">
            Use the form above to add an event.
          </p>
        </div>
      )}
    </div>
  );
}
