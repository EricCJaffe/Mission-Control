/**
 * Build the small exercise-demo catalog from the upstream dataset.
 *
 * The dataset JSON is ~17 MB and the GIFs are Gym visual media, so neither is
 * written into this repo. Pass a local checkout of data/exercises.json:
 *
 *   node scripts/match-exercise-demos.ts /path/to/exercises.json
 *
 * Writes src/lib/fitness/exercise-demos.json
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXERCISE_DEMO_OVERRIDES } from '../src/lib/fitness/exercise-demo-overrides.ts';
import {
  displayDatasetName,
  rankExerciseMatches,
  resolveRoutineExercise,
} from '../src/lib/fitness/exercise-demo-match.ts';
import { uniqueStrengthRoutineExercises } from '../src/lib/fitness/strength-routine-exercises.ts';

const SOURCE_COMMIT = '7455efae41b330c265e7cd4b78dfa848e7ce5ebd';

type Upstream = {
  id: string;
  name: string;
  equipment: string;
  target: string;
  muscle_group: string;
  secondary_muscles: string[];
  instruction_steps: { en?: string[] };
  image: string;
  gif_url: string;
  attribution: string;
};

const here = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(here, '../src/lib/fitness/exercise-demos.json');
const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: node scripts/match-exercise-demos.ts /path/to/exercises.json');
  process.exit(1);
}

const dataset = JSON.parse(readFileSync(inputPath, 'utf8')) as Upstream[];
if (!Array.isArray(dataset) || dataset.length < 1000) {
  console.error(`Expected the 1,324-row exercises dataset, got ${Array.isArray(dataset) ? dataset.length : 'non-array'}.`);
  process.exit(1);
}

type CatalogEntry = {
  routineName: string;
  via: 'fuzzy' | 'override';
  score: number;
  datasetId: string;
  datasetName: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  steps: string[];
  image: string;
  gif: string;
  attribution: string;
};

type Miss = {
  routineName: string;
  equipment: string | null;
  reason: string;
  closest: { datasetId: string; datasetName: string; score: number } | null;
  override: string | null;
};

function alsoWorks(row: Upstream): string[] {
  const seen = new Set<string>([row.target.toLowerCase()]);
  const out: string[] = [];
  for (const muscle of [row.muscle_group, ...row.secondary_muscles]) {
    const key = muscle.toLowerCase();
    if (!muscle.trim() || seen.has(key)) continue;
    seen.add(key);
    out.push(muscle);
  }
  return out;
}

const byName: Record<string, CatalogEntry> = {};
const unmatched: Miss[] = [];
const fuzzyMisses: Miss[] = [];

for (const routine of uniqueStrengthRoutineExercises()) {
  const ranked = rankExerciseMatches(routine.name, routine.equipment, dataset);
  const top = ranked[0];
  const resolved = resolveRoutineExercise(routine.name, routine.equipment, dataset, EXERCISE_DEMO_OVERRIDES);
  const fuzzyAccepted = resolved.kind === 'matched' && resolved.via === 'fuzzy';
  const override = Object.prototype.hasOwnProperty.call(EXERCISE_DEMO_OVERRIDES, routine.name)
    ? EXERCISE_DEMO_OVERRIDES[routine.name] ?? null
    : null;

  console.log(`\n${routine.name}`);
  for (const row of ranked.slice(0, 3)) {
    console.log(`  ${row.score}\t${row.exercise.id}\t${row.exercise.name}`);
  }

  if (!fuzzyAccepted) {
    fuzzyMisses.push({
      routineName: routine.name,
      equipment: routine.equipment,
      reason: resolved.kind === 'unmatched' ? resolved.reason : 'Accepted only by manual override.',
      closest: top && top.score > 0
        ? { datasetId: top.exercise.id, datasetName: displayDatasetName(top.exercise.name), score: top.score }
        : null,
      override,
    });
  }

  if (resolved.kind === 'unmatched') {
    unmatched.push({
      routineName: routine.name,
      equipment: routine.equipment,
      reason: resolved.reason,
      closest: resolved.closest
        ? {
            datasetId: resolved.closest.exercise.id,
            datasetName: displayDatasetName(resolved.closest.exercise.name),
            score: resolved.closest.score,
          }
        : null,
      override,
    });
    console.log(`  UNMATCHED — ${resolved.reason}`);
    continue;
  }

  const row = resolved.exercise;
  const steps = (row.instruction_steps.en ?? []).map((step) => step.trim()).filter(Boolean);
  if (steps.length === 0 || !row.image || !row.gif_url) {
    console.error(`Dataset row ${row.id} is missing English steps or media.`);
    process.exit(1);
  }
  byName[routine.name.toLowerCase()] = {
    routineName: routine.name,
    via: resolved.via,
    score: resolved.score,
    datasetId: row.id,
    datasetName: displayDatasetName(row.name),
    equipment: row.equipment,
    target: row.target,
    secondaryMuscles: alsoWorks(row),
    steps,
    image: row.image,
    gif: row.gif_url,
    attribution: row.attribution,
  };
  console.log(`  -> ${resolved.via} ${row.id} ${displayDatasetName(row.name)}`);
}

const catalog = {
  source: 'https://github.com/hasaneyldrm/exercises-dataset',
  sourceCommit: SOURCE_COMMIT,
  mediaBaseUrl: `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${SOURCE_COMMIT}/`,
  dataLicense: 'MIT',
  dataCopyright: 'Copyright (c) 2026 Hasan Emir Yıldırım',
  dataLicenseNotice:
    'Instruction text and exercise metadata are from the exercises dataset and are MIT licensed. ' +
    'The MIT license covers only that data. It does not cover the images or GIFs.',
  mediaNotice:
    'Thumbnails and animation GIFs are © Gym visual (https://gymvisual.com/). ' +
    'They are loaded from the dataset repository via the mediaBaseUrl above and are not stored in Mission Control. ' +
    'Every use keeps the attribution "© Gym visual — https://gymvisual.com/".',
  byName,
  fuzzyMisses,
  unmatched,
};

writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`\nWrote ${Object.keys(byName).length} demos, ${unmatched.length} still unmatched, ${fuzzyMisses.length} fuzzy misses -> ${outPath}`);
