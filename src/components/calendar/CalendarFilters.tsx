'use client';

import { useState, useRef, useEffect } from 'react';
import { Filter, X } from 'lucide-react';
import { EventFilter, createDefaultFilter, hasActiveFilters } from '@/lib/calendar/date-utils';

type CalendarFiltersProps = {
  filters: EventFilter;
  onFiltersChange: (filters: EventFilter) => void;
};

const EVENT_TYPES = [
  'Monthly Review',
  'Weekly Planning',
  'Daily Anchor',
  'Sermon/Teaching',
  'Client Work',
  'Family',
  'Health/Training',
  'Workout',
];

const DOMAINS = ['God First', 'Health', 'Family', 'Impact'];

export default function CalendarFilters({
  filters,
  onFiltersChange,
}: CalendarFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const activeFiltersCount =
    filters.eventTypes.size +
    filters.domains.size +
    (filters.showCompleted ? 0 : 1) +
    (filters.dateRange ? 1 : 0);

  const toggleEventType = (type: string) => {
    const newTypes = new Set(filters.eventTypes);
    if (newTypes.has(type)) {
      newTypes.delete(type);
    } else {
      newTypes.add(type);
    }
    onFiltersChange({ ...filters, eventTypes: newTypes });
  };

  const toggleDomain = (domain: string) => {
    const newDomains = new Set(filters.domains);
    if (newDomains.has(domain)) {
      newDomains.delete(domain);
    } else {
      newDomains.add(domain);
    }
    onFiltersChange({ ...filters, domains: newDomains });
  };

  const toggleShowCompleted = () => {
    onFiltersChange({ ...filters, showCompleted: !filters.showCompleted });
  };

  const setDateRange = (start: string, end: string) => {
    if (start && end) {
      onFiltersChange({ ...filters, dateRange: { start, end } });
    } else {
      onFiltersChange({ ...filters, dateRange: null });
    }
  };

  const clearFilters = () => {
    onFiltersChange(createDefaultFilter());
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <Filter className="h-4 w-4" />
        Filters
        {activeFiltersCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
            {activeFiltersCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-12 z-20 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Filters</h3>
            {hasActiveFilters(filters) && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <X className="h-3 w-3" />
                Clear all
              </button>
            )}
          </div>

          {/* Event Types */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-slate-700">
              Event Type
            </label>
            <div className="space-y-2">
              {EVENT_TYPES.map((type) => (
                <label
                  key={type}
                  className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={filters.eventTypes.has(type)}
                    onChange={() => toggleEventType(type)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>

          {/* Domains */}
          <div className="mb-4">
            <label className="mb-2 block text-xs font-medium text-slate-700">
              Domain
            </label>
            <div className="space-y-2">
              {DOMAINS.map((domain) => (
                <label
                  key={domain}
                  className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={filters.domains.has(domain)}
                    onChange={() => toggleDomain(domain)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {domain}
                </label>
              ))}
            </div>
          </div>

          {/* Show Completed */}
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showCompleted}
                onChange={toggleShowCompleted}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Show completed workouts
            </label>
          </div>

          {/* Date Range */}
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-700">
              Date Range
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={filters.dateRange?.start || ''}
                onChange={(e) => setDateRange(e.target.value, filters.dateRange?.end || '')}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                placeholder="Start"
              />
              <input
                type="date"
                value={filters.dateRange?.end || ''}
                onChange={(e) => setDateRange(filters.dateRange?.start || '', e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                placeholder="End"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
