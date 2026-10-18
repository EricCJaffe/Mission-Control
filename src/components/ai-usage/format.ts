import { APP_TIMEZONE } from '@/lib/day';
import type { Rag } from '@/lib/ai-usage/forecast';

const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const WHEN = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export const tokens = (n: number) => COMPACT.format(n);
export const when = (d: Date | string) => WHEN.format(typeof d === 'string' ? new Date(d) : d);
export const pct = (n: number | null, digits = 0) => (n === null ? '—' : `${n.toFixed(digits)}%`);

export const RAG_LABEL: Record<Rag, string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  none: 'No data',
};

/** Card accents. Gray for "none": no reading is not a green. */
export const RAG_CARD: Record<Rag, string> = {
  red: 'border-red-300',
  yellow: 'border-yellow-300',
  green: 'border-green-300',
  none: 'border-slate-300',
};

export const RAG_PILL: Record<Rag, 'red' | 'yellow' | 'green' | 'slate'> = {
  red: 'red',
  yellow: 'yellow',
  green: 'green',
  none: 'slate',
};

export const RAG_BAR: Record<Rag, string> = {
  red: 'bg-red-500',
  yellow: 'bg-yellow-400',
  green: 'bg-green-500',
  none: 'bg-slate-300',
};
