'use client';

import { useRef, useState } from 'react';

type Props = {
  value: number | '';
  onChange: (value: number | '') => void;
  /** How much one tap of −/+ moves the value (5 lbs, 1 rep). */
  step: number;
  /** Allows decimals when typed by hand — plate math needs 2.5s. */
  decimal?: boolean;
  min?: number;
  max?: number;
  /** Used for the button aria-labels, e.g. "weight" → "Increase weight". */
  label: string;
};

/**
 * Number field for set entry with −/+ steppers on either side.
 *
 * Two mobile-specific behaviours drive the implementation:
 *  - Tapping the field puts the caret at the END of the value, so you can
 *    backspace straight away instead of landing in front of the digits.
 *  - It renders as type="text" rather than type="number", because number
 *    inputs don't support setSelectionRange in Safari/Chrome (the caret
 *    can't be moved) and they add native spinners we're replacing.
 */
export default function SetNumberInput({
  value,
  onChange,
  step,
  decimal = false,
  min = 0,
  max,
  label,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  // While focused we hold the raw string so partial entry like "22." survives
  // a render — the committed value stays a number.
  const [draft, setDraft] = useState<string | null>(null);

  const shown = draft ?? (value === '' ? '' : String(value));

  function clamp(n: number) {
    if (n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  }

  function nudge(delta: number) {
    const base = value === '' ? 0 : value;
    // Round to 2dp so repeated 2.5 steps don't accumulate float dust.
    setDraft(null);
    onChange(clamp(Math.round((base + delta) * 100) / 100));
  }

  function caretToEnd() {
    const el = inputRef.current;
    if (!el) return;
    // Deferred: the browser sets its own caret position after focus/click,
    // so we have to move it on the next frame to win.
    requestAnimationFrame(() => {
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {
        // Older engines can still reject selection on some input types.
      }
    });
  }

  function handleChange(raw: string) {
    let cleaned = decimal ? raw.replace(/[^0-9.]/g, '') : raw.replace(/[^0-9]/g, '');
    if (decimal) cleaned = cleaned.replace(/(\..*)\./g, '$1'); // keep only the first dot
    setDraft(cleaned);
    if (cleaned === '' || cleaned === '.') {
      onChange('');
      return;
    }
    const parsed = Number(cleaned);
    if (!Number.isNaN(parsed)) onChange(clamp(parsed));
  }

  const btn =
    'flex h-11 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-base font-bold leading-none text-slate-500 active:bg-slate-200 disabled:opacity-40';

  return (
    // min-w-0 lets the grid column shrink below the steppers' intrinsic width
    // on narrow phones instead of pushing the row off-screen.
    <div className="flex w-full min-w-0 items-center gap-0.5">
      <button
        type="button"
        onClick={() => nudge(-step)}
        aria-label={`Decrease ${label}`}
        disabled={value !== '' && value <= min}
        className={btn}
      >
        −
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={shown}
        onFocus={caretToEnd}
        onClick={caretToEnd}
        onBlur={() => setDraft(null)}
        onChange={(e) => handleChange(e.target.value)}
        aria-label={label}
        // min-w keeps 3 digits ("135", "225") legible on a 320px phone.
        className="h-11 w-full min-w-[2.1rem] rounded-lg border border-slate-200 bg-white px-0.5 text-center text-[15px] font-semibold tabular-nums focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
        placeholder="0"
      />
      <button
        type="button"
        onClick={() => nudge(step)}
        aria-label={`Increase ${label}`}
        className={btn}
      >
        +
      </button>
    </div>
  );
}
