'use client';

import { useEffect, useId, useState } from 'react';
import {
  exerciseDemoGifUrl,
  exerciseDemoImageUrl,
  lookupExerciseDemo,
  unmatchedExerciseDemo,
  type ExerciseDemo,
} from '@/lib/fitness/exercise-demo-catalog';

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** False until mount, so the still image paints first and a reduced-motion user never requests the GIF. */
function useShowMotion(): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setShow(!media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return show;
}

function DemoStill({ demo, size }: { demo: ExerciseDemo; size: number }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    // Native img so the third-party GIF is not re-encoded. The still is 180px and lazy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={exerciseDemoImageUrl(demo)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setHidden(true)}
      className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/** Small still used in exercise lists. Nothing renders when this name has no demo. */
export function ExerciseDemoThumb({ name }: { name: string }) {
  const demo = lookupExerciseDemo(name);
  if (!demo) return null;
  return <DemoStill demo={demo} size={44} />;
}

export function ExerciseDemoFigure({ demo, loading = 'eager' }: { demo: ExerciseDemo; loading?: 'eager' | 'lazy' }) {
  const showMotion = useShowMotion();
  const [hidden, setHidden] = useState(false);
  const src = showMotion ? exerciseDemoGifUrl(demo) : exerciseDemoImageUrl(demo);
  const muscles = [titleCase(demo.target), ...demo.secondaryMuscles.map(titleCase)];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      {!hidden && (
        // Native img: next/image re-encodes GIFs and drops the animation.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={showMotion ? `${titleCase(demo.datasetName)} demonstration` : ''}
          width={180}
          height={180}
          loading={loading}
          decoding="async"
          onError={() => setHidden(true)}
          className="h-[180px] w-[180px] shrink-0 rounded-xl border border-slate-200 bg-slate-50 object-contain"
        />
      )}
      <div className="min-w-0">
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Target. </span>
          {muscles.join(', ')}
        </p>
        <p className="mt-1 text-sm text-slate-700">
          <span className="font-semibold text-slate-900">Equipment. </span>
          {titleCase(demo.equipment)}
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-snug text-slate-700">
          {demo.steps.map((step, index) => (
            <li key={`${demo.datasetId}-${index}`}>{step}</li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] leading-snug text-slate-400">
          <a
            href="https://gymvisual.com/"
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-slate-300 underline-offset-2 hover:text-slate-600"
          >
            {demo.attribution}
          </a>
        </p>
      </div>
    </div>
  );
}

/** Full GIF, muscles, equipment, and English steps. For the exercise page. */
export function ExerciseDemoPanel({ name }: { name: string }) {
  const demo = lookupExerciseDemo(name);
  if (!demo) {
    if (!unmatchedExerciseDemo(name)) return null;
    return (
      <p className="text-sm text-slate-500">No demonstration clip for this exercise.</p>
    );
  }
  return <ExerciseDemoFigure demo={demo} />;
}

/**
 * Logger control. The still is in the header; the GIF is requested only after
 * this opens, so a six-exercise workout does not download six animations.
 */
export function ExerciseDemoDisclosure({ name }: { name: string }) {
  const demo = lookupExerciseDemo(name);
  const unmatched = unmatchedExerciseDemo(name);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!demo && !unmatched) return null;

  if (!demo) {
    return (
      <p className="px-4 py-2 text-xs text-slate-400">
        No demonstration clip for this exercise.
      </p>
    );
  }

  return (
    <div className="border-t border-slate-100">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[44px] w-full items-center px-4 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50"
      >
        {open ? 'Hide demo' : 'Demo and steps'}
      </button>
      {open && (
        <div id={panelId} className="px-4 pb-4">
          <ExerciseDemoFigure demo={demo} loading="lazy" />
        </div>
      )}
    </div>
  );
}
