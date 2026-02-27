/**
 * Calendar Date Utilities
 *
 * Core date arithmetic and calendar grid generation for month/week/day views.
 * Uses native Date API for performance and minimal dependencies.
 */

// ============================================================================
// Date Arithmetic
// ============================================================================

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addWeeks(date: Date, weeks: number): Date {
  return addDays(date, weeks * 7);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1, Sunday = 0
  result.setDate(result.getDate() + diff);
  return startOfDay(result);
}

export function endOfWeek(date: Date): Date {
  const result = startOfWeek(date);
  return endOfDay(addDays(result, 6));
}

export function startOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setDate(1);
  return startOfDay(result);
}

export function endOfMonth(date: Date): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + 1, 0); // Day 0 of next month = last day of current month
  return endOfDay(result);
}

// ============================================================================
// Calendar Grid Generation
// ============================================================================

/**
 * Generate a 6-week calendar grid for month view.
 *
 * Returns 6 weeks × 7 days (42 total days), including padding from
 * previous/next months to fill the grid.
 *
 * @param year - Full year (e.g., 2026)
 * @param month - Month (0-11, JavaScript Date convention)
 * @returns Array of 6 weeks, each containing 7 Date objects
 */
export function getMonthGrid(year: number, month: number): Date[][] {
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Find the Monday of the week containing the 1st of the month
  const gridStart = startOfWeek(firstDayOfMonth);

  // Generate 6 weeks (42 days)
  const weeks: Date[][] = [];
  let currentDate = gridStart;

  for (let week = 0; week < 6; week++) {
    const weekDays: Date[] = [];
    for (let day = 0; day < 7; day++) {
      weekDays.push(new Date(currentDate));
      currentDate = addDays(currentDate, 1);
    }
    weeks.push(weekDays);
  }

  return weeks;
}

/**
 * Generate a week grid (7 days) starting from the Monday of the week containing the given date.
 *
 * @param date - Any date within the target week
 * @returns Array of 7 Date objects (Monday through Sunday)
 */
export function getWeekGrid(date: Date): Date[] {
  const weekStart = startOfWeek(date);
  const days: Date[] = [];

  for (let i = 0; i < 7; i++) {
    days.push(addDays(weekStart, i));
  }

  return days;
}

// ============================================================================
// Date Formatting & Comparison
// ============================================================================

/**
 * Format date as ISO date string (YYYY-MM-DD).
 * Used for API calls and date comparisons.
 */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse ISO date string to Date object.
 */
export function fromISODate(isoDate: string): Date {
  return new Date(isoDate);
}

/**
 * Check if two dates are the same day (ignoring time).
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * Check if date is in the past (before today).
 */
export function isPast(date: Date): boolean {
  const today = startOfDay(new Date());
  return startOfDay(date) < today;
}

/**
 * Check if date is today.
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/**
 * Check if date is in the current month.
 */
export function isCurrentMonth(date: Date, year: number, month: number): boolean {
  return date.getFullYear() === year && date.getMonth() === month;
}

/**
 * Format date for display (e.g., "Mon, Feb 27" or "February 27, 2026").
 */
export function formatDate(date: Date, format: 'short' | 'long' = 'short'): string {
  if (format === 'short') {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format time (e.g., "2:30 PM").
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format date and time together (e.g., "Mon, Feb 27 at 2:30 PM").
 */
export function formatDateTime(date: Date): string {
  return `${formatDate(date)} at ${formatTime(date)}`;
}

// ============================================================================
// Workout Tag Parsing
// ============================================================================

export type WorkoutTagData = {
  isPlanned: boolean;
  isLogged: boolean;
  plannedWorkoutId?: string;
  loggedWorkoutId?: string;
};

/**
 * Parse alignment_tag to identify workout events.
 *
 * Patterns:
 * - Planned workout: "planned_workout:{id}"
 * - Logged workout: "workout:{log_id}"
 * - Regular event: null or any other string
 *
 * @param alignmentTag - The alignment_tag from calendar_events
 * @returns WorkoutTagData object or null for non-workout events
 */
export function parseWorkoutTag(alignmentTag: string | null): WorkoutTagData | null {
  if (!alignmentTag) return null;

  const plannedMatch = alignmentTag.match(/^planned_workout:(.+)$/);
  if (plannedMatch) {
    return {
      isPlanned: true,
      isLogged: false,
      plannedWorkoutId: plannedMatch[1],
    };
  }

  const loggedMatch = alignmentTag.match(/^workout:(.+)$/);
  if (loggedMatch) {
    return {
      isPlanned: false,
      isLogged: true,
      loggedWorkoutId: loggedMatch[1],
    };
  }

  return null; // Not a workout event
}

// ============================================================================
// Type Definitions
// ============================================================================

export type CalendarView = 'month' | 'week' | 'day';

export type EventFilter = {
  eventTypes: Set<string>;
  domains: Set<string>;
  showCompleted: boolean;
  dateRange: { start: string; end: string } | null;
};

/**
 * Create default event filter (no filters applied).
 */
export function createDefaultFilter(): EventFilter {
  return {
    eventTypes: new Set(),
    domains: new Set(),
    showCompleted: true,
    dateRange: null,
  };
}

/**
 * Check if any filters are active.
 */
export function hasActiveFilters(filter: EventFilter): boolean {
  return (
    filter.eventTypes.size > 0 ||
    filter.domains.size > 0 ||
    !filter.showCompleted ||
    filter.dateRange !== null
  );
}
