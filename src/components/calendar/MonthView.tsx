'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import Link from 'next/link';
import {
  getMonthGrid,
  toISODate,
  isSameDay,
  isToday,
  isCurrentMonth,
  parseWorkoutTag,
  addMonths,
} from '@/lib/calendar/date-utils';

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

type MonthViewProps = {
  events: CalendarEvent[];
  selectedDate: string; // ISO date string
  onDateClick: (date: string) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
};

export default function MonthView({
  events,
  selectedDate,
  onDateClick,
  onNavigate,
}: MonthViewProps) {
  const selectedDateObj = new Date(selectedDate);
  const [year, setYear] = useState(selectedDateObj.getFullYear());
  const [month, setMonth] = useState(selectedDateObj.getMonth());

  const monthGrid = getMonthGrid(year, month);
  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Group events by date (ISO string)
  const eventsByDate = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const eventDate = toISODate(new Date(event.start_at));
    const existing = eventsByDate.get(eventDate) || [];
    eventsByDate.set(eventDate, [...existing, event]);
  });

  const handlePrev = () => {
    const newDate = addMonths(new Date(year, month, 1), -1);
    setYear(newDate.getFullYear());
    setMonth(newDate.getMonth());
    onNavigate('prev');
  };

  const handleNext = () => {
    const newDate = addMonths(new Date(year, month, 1), 1);
    setYear(newDate.getFullYear());
    setMonth(newDate.getMonth());
    onNavigate('next');
  };

  const handleToday = () => {
    const today = new Date();
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    onNavigate('today');
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      {/* Header with navigation */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">{monthName}</h2>
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
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={handleNext}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Day of week headers */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-slate-500"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {monthGrid.flat().map((date, index) => {
          const dateStr = toISODate(date);
          const dayEvents = eventsByDate.get(dateStr) || [];
          const isSelected = isSameDay(date, selectedDateObj);
          const isTodayDate = isToday(date);
          const isInCurrentMonth = isCurrentMonth(date, year, month);

          // Separate workout events from regular events
          const workoutEvents = dayEvents.filter((e) => parseWorkoutTag(e.alignment_tag));
          const regularEvents = dayEvents.filter((e) => !parseWorkoutTag(e.alignment_tag));

          return (
            <button
              key={index}
              onClick={() => onDateClick(dateStr)}
              className={`
                min-h-[80px] rounded-lg border p-2 text-left transition-colors
                ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}
                ${!isInCurrentMonth ? 'text-slate-400' : 'text-slate-900'}
              `}
            >
              {/* Date number */}
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`
                    text-sm font-medium
                    ${isTodayDate && isInCurrentMonth ? 'flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white' : ''}
                  `}
                >
                  {date.getDate()}
                </span>
              </div>

              {/* Event badges */}
              <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                {/* Show first 2 regular events */}
                {regularEvents.slice(0, 2).map((event) => (
                  <div
                    key={event.id}
                    className="truncate rounded px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200"
                    title={event.title}
                  >
                    {event.title}
                  </div>
                ))}

                {/* Show first 2 workout events */}
                {workoutEvents.slice(0, 2).map((event) => {
                  const workoutData = parseWorkoutTag(event.alignment_tag);
                  const isLogged = workoutData?.isLogged || false;
                  const colors = getWorkoutTypeColors(event.title);

                  // Logged workout - link to workout history
                  if (isLogged && workoutData?.loggedWorkoutId) {
                    return (
                      <Link
                        key={event.id}
                        href={`/fitness/history/${workoutData.loggedWorkoutId}`}
                        className={`block truncate rounded px-1.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border} ${colors.hoverBg} hover:underline cursor-pointer transition-all`}
                        title={`${event.title} - Click to view workout details`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.title} ✓
                      </Link>
                    );
                  }

                  // Planned workout - link to plans page
                  if (workoutData?.isPlanned) {
                    return (
                      <Link
                        key={event.id}
                        href="/fitness/plans"
                        className={`block truncate rounded px-1.5 py-0.5 text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border} ${colors.hoverBg} hover:underline cursor-pointer transition-all opacity-75`}
                        title={`${event.title} - Click to view in plans`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.title}
                      </Link>
                    );
                  }

                  return null;
                })}

                {/* Show "+N more" if there are more events */}
                {dayEvents.length > 4 && (
                  <div className="text-xs text-slate-500">
                    +{dayEvents.length - 4} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
