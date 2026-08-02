/**
 * Shared traffic-light styling for status readouts.
 *
 * Two rules this encodes deliberately:
 *
 * 1. These colours mean STATUS, never affordance. Primary actions stay lime;
 *    if green also meant "clickable", green would stop meaning "good".
 * 2. "No data" is grey, never red. Rendering an unmeasured pillar as a concern
 *    conflates "you're failing" with "we haven't asked yet", and the fastest
 *    way to make someone ignore a red badge is to show it when nothing's wrong.
 *
 * Every level carries a label as well as a colour. Red/green colour blindness
 * affects roughly 8% of men, so hue alone can't be the signal — always render
 * the label or an icon alongside.
 */

export type StatusLevel = 'good' | 'watch' | 'concern' | 'unknown';

export type StatusStyle = {
  level: StatusLevel;
  label: string;
  /** Card/section border. */
  border: string;
  /** Tinted surface. */
  bg: string;
  /** Body text on that surface. */
  text: string;
  /** Solid fill for pills and bars. */
  solid: string;
  /** Hex, for SVG strokes and inline styles. */
  hex: string;
};

export const STATUS_STYLES: Record<StatusLevel, StatusStyle> = {
  good: {
    level: 'good',
    label: 'Good',
    border: 'border-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    solid: 'bg-emerald-600 text-white',
    hex: '#059669',
  },
  watch: {
    level: 'watch',
    label: 'Pay attention',
    border: 'border-amber-500',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    solid: 'bg-amber-500 text-white',
    hex: '#f59e0b',
  },
  concern: {
    level: 'concern',
    label: 'Concern',
    border: 'border-rose-500',
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    solid: 'bg-rose-600 text-white',
    hex: '#e11d48',
  },
  unknown: {
    level: 'unknown',
    label: 'No data',
    border: 'border-slate-300',
    bg: 'bg-slate-50',
    text: 'text-slate-500',
    solid: 'bg-slate-400 text-white',
    hex: '#94a3b8',
  },
};

/** Bands shared with the Flourishing pillars so every score reads alike. */
export function levelForScore(score: number | null | undefined): StatusLevel {
  if (score === null || score === undefined || !Number.isFinite(score)) return 'unknown';
  if (score >= 8) return 'good';
  if (score >= 6) return 'watch';
  return 'concern';
}

export function statusForScore(score: number | null | undefined): StatusStyle {
  return STATUS_STYLES[levelForScore(score)];
}
