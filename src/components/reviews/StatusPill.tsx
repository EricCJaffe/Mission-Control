import { styleFor, type ReviewStatus } from '@/lib/reviews/status';

/**
 * The color, the glyph AND the word, always all three.
 *
 * Red/green color blindness affects roughly 8% of men, so hue can never be the
 * only carrier of the signal — the same rule `src/lib/status-colors.ts` states
 * and for the same reason.
 */
export function StatusPill({
  status,
  carried = 0,
  size = 'sm',
}: {
  status: ReviewStatus;
  /** Consecutive periods at this status. Shown from the second one onward. */
  carried?: number;
  size?: 'sm' | 'lg';
}) {
  const style = styleFor(status);
  const pad = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${pad} ${style.solid}`}
      title={style.meaning}
    >
      <span aria-hidden>{style.glyph}</span>
      {style.label}
      {carried > 1 && status !== 'green' && status !== 'not_due' && (
        <span className="rounded-full bg-black/20 px-1.5 text-[10px] font-bold">
          ×{carried}
        </span>
      )}
    </span>
  );
}

/** A bare square for the trend strip, where there is no room for a word. */
export function StatusChip({
  status,
  label,
  href,
}: {
  status: ReviewStatus | null;
  label: string;
  href?: string;
}) {
  const style = styleFor(status ?? 'not_due');
  const chip = (
    <span
      className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-xs font-bold ${style.solid}`}
      title={`${label} — ${style.label}`}
    >
      <span aria-hidden>{style.glyph}</span>
      <span className="sr-only">
        {label}: {style.label}
      </span>
    </span>
  );
  return href ? <a href={href}>{chip}</a> : chip;
}
