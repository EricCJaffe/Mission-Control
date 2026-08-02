#!/usr/bin/env node
/**
 * Seeds the built-in Bible reading plans.
 *
 * Plans are generated from the app's own canonical book metadata rather than
 * hand-authored, so a 365-day plan is a few lines instead of 365 rows of
 * copy-paste — and the plans can never drift from what the app's helpers
 * produce, because this imports those helpers directly.
 *
 * Only REFERENCES are stored, never scripture text.
 *
 * Idempotent: re-running replaces a plan's days in place, keyed on slug.
 *
 * Usage: node --env-file=.env.local scripts/seed-reading-plans.ts
 */

import { createClient } from '@supabase/supabase-js';
import { allChapters, buildPlanDays, humanReferences, BOOKS } from '../src/lib/spirit/bible.ts';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

type PlanSpec = {
  slug: string;
  name: string;
  description: string;
  category: string;
  chapters: () => string[];
  days: number;
};

const PLANS: PlanSpec[] = [
  {
    slug: 'bible-in-a-year',
    name: 'Bible in a Year',
    description: 'The whole Bible straight through, Genesis to Revelation, in 365 days.',
    category: 'whole_bible',
    chapters: () => allChapters(),
    days: 365,
  },
  {
    slug: 'new-testament-90',
    name: 'New Testament in 90 Days',
    description: 'Matthew through Revelation at about three chapters a day.',
    category: 'testament',
    chapters: () => allChapters((b) => b.testament === 'NT'),
    days: 90,
  },
  {
    slug: 'gospel-of-john-21',
    name: 'John in 21 Days',
    description: 'One chapter a day through the fourth gospel.',
    category: 'book',
    chapters: () => allChapters((b) => b.id === 'JHN'),
    days: 21,
  },
  {
    slug: 'psalms-30',
    name: 'Psalms in 30 Days',
    description: 'The whole psalter in a month, five psalms a day.',
    category: 'book',
    chapters: () => allChapters((b) => b.id === 'PSA'),
    days: 30,
  },
  {
    slug: 'proverbs-31',
    name: 'A Proverb a Day',
    description: 'One chapter of Proverbs for each day of the month.',
    category: 'book',
    chapters: () => allChapters((b) => b.id === 'PRO'),
    days: 31,
  },
  {
    slug: 'wisdom-books-60',
    name: 'Wisdom Literature in 60 Days',
    description: 'Job, Ecclesiastes and Song of Solomon alongside Proverbs.',
    category: 'topical',
    chapters: () => allChapters((b) => ['JOB', 'PRO', 'ECC', 'SNG'].includes(b.id)),
    days: 60,
  },
];

// Guard against silently seeding a broken canon.
if (BOOKS.length !== 66 || allChapters().length !== 1189) {
  console.error(`Canon looks wrong: ${BOOKS.length} books, ${allChapters().length} chapters.`);
  process.exit(1);
}

for (const plan of PLANS) {
  const chapters = plan.chapters();
  const days = buildPlanDays(chapters, plan.days);

  const { data: existing } = await supabase
    .from('reading_plans')
    .select('id')
    .eq('slug', plan.slug)
    .maybeSingle();

  let planId: string | undefined = existing?.id;
  if (planId) {
    await supabase
      .from('reading_plans')
      .update({
        name: plan.name,
        description: plan.description,
        category: plan.category,
        day_count: plan.days,
      })
      .eq('id', planId);
    await supabase.from('reading_plan_days').delete().eq('plan_id', planId);
  } else {
    const { data, error } = await supabase
      .from('reading_plans')
      .insert({
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        category: plan.category,
        day_count: plan.days,
      })
      .select('id')
      .single();
    if (error) {
      console.error(`  ${plan.slug}: ${error.message}`);
      continue;
    }
    planId = data.id;
  }

  const rows = days.map((passages, i) => ({
    plan_id: planId,
    day_number: i + 1,
    passages,
    label: humanReferences(passages),
  }));

  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from('reading_plan_days').insert(rows.slice(i, i + 200));
    if (error) {
      console.error(`  ${plan.slug} days ${i}: ${error.message}`);
      break;
    }
  }

  console.log(
    `${plan.slug.padEnd(22)} ${String(plan.days).padStart(3)} days  ${String(chapters.length).padStart(4)} chapters  e.g. "${rows[0].label}"`
  );
}

console.log('\nDone.');
