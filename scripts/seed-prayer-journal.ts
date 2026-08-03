#!/usr/bin/env node
/**
 * Seeds the prayer module from Eric's 2025 prayer journal.
 *
 * The nesting mirrors the document exactly — households contain people,
 * people contain their own named concerns — because that structure IS the
 * journal. Flattening it into tags would have produced a tidier schema and a
 * worse record of how he actually prays.
 *
 * Requests are only created where the journal names a specific petition.
 * Where it names a person with no request attached, the subject is seeded
 * alone: inventing petitions on someone's behalf would put words in his mouth
 * in the one place that should be entirely his.
 *
 * Idempotent — reseeding replaces the seeded tree without touching anything
 * added by hand afterwards (those have no seed marker).
 *
 * Usage: node --env-file=.env.local scripts/seed-prayer-journal.ts
 */

import { createClient } from '@supabase/supabase-js';

const U = process.env.PLAN_USER_ID ?? '96982dec-d682-4dd0-9498-1d2d226dab83';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Seed = {
  name: string;
  notes?: string;
  scripture?: string[];
  requests?: string[];
  children?: Seed[];
};

type Category =
  | 'family' | 'friends' | 'church' | 'missions'
  | 'government' | 'world' | 'work' | 'finances' | 'self' | 'other';

const JOURNAL: Array<{ category: Category; roots: Seed[] }> = [
  {
    category: 'self',
    roots: [
      {
        name: 'Spirit',
        notes: 'Spending time with God. Schedule it or it won’t get done.',
        scripture: ['Ephesians 3:14, 16-19', 'Ephesians 6', '1 Thessalonians 5:23-24'],
      },
      {
        name: 'Soul — mind, will, emotions',
        notes:
          'Transform the mind, crucify the flesh, don’t trust in emotions. Is the current prayer one of asking, complaining, or waiting? All are ok. Waiting seems like unanswered prayer.',
        scripture: ['Romans 12:1-2', 'James 4:2-3'],
      },
      {
        name: 'Body — health',
        notes:
          'A healthy focus on physical health and wellbeing. Discipline in the things under my control, knowing You can take me home any day You choose. To live a healthy life with Mary Jo up until old age.',
        children: [{ name: 'Diet / Nutrition' }, { name: 'Exercise' }],
      },
      { name: 'Big decisions' },
    ],
  },
  {
    category: 'family',
    roots: [
      { name: 'Mary Jo' },
      {
        name: 'Matt and Becky',
        children: [
          { name: 'Briley' },
          { name: 'Sophia' },
          { name: 'Noah', children: [{ name: 'Mike' }] },
        ],
      },
      {
        name: 'Miranda and Pat',
        children: [
          { name: 'Lila' },
          { name: 'Wolfie' },
          { name: 'River', requests: ['Complete and total reconciliation and repair.'] },
        ],
      },
      {
        name: 'Molly and Tyler',
        children: [
          { name: 'Maddox' },
          {
            name: 'Miles',
            children: [{ name: 'Glenn' }, { name: 'Terri' }, { name: 'David, Dan, and extended family' }],
          },
        ],
      },
      {
        name: 'Mom and Dad',
        requests: [
          'Salvation.',
          'Peace in the midst of their current circumstances.',
          'Strength for Mom to help Dad in this time of extreme need.',
        ],
      },
      { name: 'Scot', children: [{ name: 'Chase' }] },
      {
        name: 'Jodi and Andy',
        requests: ['Health and freedom from anxiety.', 'A peace that can only be found in You.'],
        children: [{ name: 'Sarah' }],
      },
      {
        name: 'Extended family — Eric’s side',
        children: [
          {
            name: 'Neil and Luz and their children',
            children: [
              { name: 'Dillon' },
              { name: 'Amanda', requests: ['Freedom from alcoholism.'] },
            ],
          },
          { name: 'Bobby and Donna', children: [{ name: 'Jeremy and Kevin' }] },
          { name: 'Gayle and Rick', children: [{ name: 'Kristi and Ricky' }] },
          { name: 'Nancy and Bobby', children: [{ name: 'Garret' }] },
          { name: 'Bob', requests: ['Health.', 'Living well in spite of the loss of his wife.'] },
        ],
      },
      {
        name: 'Extended family — Mary Jo’s side',
        children: [
          { name: 'Mary Beth and Gino' },
          {
            name: 'Steve and Tammie and their children',
            children: [
              { name: 'Brittany', requests: ['Relationship with Donnie — that it would be life-giving and point toward You.'] },
              { name: 'Trinity', requests: ['Freedom from what she is letting into her life, to freely live for You.'] },
              { name: 'Courtney', requests: ['Freedom from addiction.'] },
            ],
          },
          { name: 'Todd and his children' },
          { name: 'Joey and Gina and their children' },
        ],
      },
    ],
  },
  {
    category: 'friends',
    roots: [
      {
        name: 'Willie and Angelica',
        requests: [
          'JW Supply — that deals would close quickly.',
          'Celine and the other kids — to fully serve and live for Jesus.',
          'The right spouses for them.',
        ],
      },
      {
        name: 'Rob and Stephanie',
        requests: ['Salon.', 'Grub Brothers.', 'Their girls.', 'An ending of gossip.'],
      },
      {
        name: 'Allen Bender',
        requests: ['Dara and Daniel.', 'Health — give him the power and willingness to change.'],
      },
    ],
  },
  {
    category: 'church',
    roots: [
      {
        name: 'The Rock — home church',
        requests: [
          'Their pastoral search, their elders, their leaders, and the congregation.',
          'Give me a real heart for them while I am there. Use me to help them in whatever way You deem right and fit.',
        ],
      },
      {
        name: 'Local churches',
        children: [
          { name: 'Rise' }, { name: '11:22' }, { name: 'Celebration' },
          { name: 'Elevate Life' }, { name: 'Journey' }, { name: 'Reverb | The Collective' },
          { name: 'True Life' }, { name: 'Springs Church' }, { name: 'Springs Chapel' },
        ],
        requests: ['Lord, what church do we attend?'],
      },
    ],
  },
  {
    category: 'missions',
    roots: [
      {
        name: 'Local',
        scripture: ['Acts 1:8'],
        children: [
          { name: 'For the Least of These | Project 22' },
          { name: 'First Coast Women’s Services' },
          { name: 'Impact Clay' },
          { name: 'Mercy Support Services' },
          { name: 'College Drive Initiative' },
        ],
      },
      {
        name: 'National',
        children: [{ name: 'Acts 29' }, { name: 'ARC' }, { name: 'Other church planting organizations' }],
      },
      {
        name: 'International',
        children: [
          { name: 'For The Least of These' },
          { name: 'Zimbabwe — Mike | Dixon' },
          { name: 'Dugit — Sergey and Natasha' },
        ],
      },
    ],
  },
  {
    category: 'government',
    roots: [
      {
        name: 'Our Nation',
        notes: 'Scripture: pray for people in positions of authority.',
        children: [
          { name: 'The President and Vice President' },
          { name: 'Cabinet' },
          { name: 'House' },
          { name: 'Senate' },
          { name: 'Supreme Court Justices' },
          { name: 'Federal judges' },
          { name: 'Federal agencies' },
          { name: 'Military' },
          { name: 'Major legislation' },
        ],
      },
      {
        name: 'State',
        children: [
          { name: 'Governor' }, { name: 'Cabinet' }, { name: 'House' }, { name: 'Senate' },
          { name: 'Judges' }, { name: 'Major legislation' }, { name: 'Law enforcement' },
        ],
      },
      {
        name: 'Local',
        children: [
          { name: 'Commissioners' },
          { name: 'City managers and staffs' },
          {
            name: 'School boards — Clay, Duval, St. John’s, Baker',
            requests: [
              'Superintendents — that they would be good and Godly leaders who allow churches to partner with them.',
              'Board members — that they keep open doors for faith and close doors to what stands in opposition to God’s Word.',
            ],
          },
          { name: 'Constitutional officers' },
          { name: 'Sheriff Michelle Cook' },
          { name: 'Other regional leaders' },
          { name: 'Chamber of Commerce' },
          { name: 'Local non-profits and Impact Clay' },
          { name: 'Key influencers' },
          { name: 'Patrick' },
          { name: 'Joelle' },
        ],
      },
    ],
  },
  {
    category: 'world',
    roots: [
      { name: 'Israel / Palestinian conflict' },
      { name: 'Ukraine / Russia war' },
      { name: 'Iran' },
      { name: 'Global elite' },
      { name: 'Immigration' },
      { name: 'Poverty' },
    ],
  },
  {
    category: 'finances',
    roots: [
      {
        name: 'Finances',
        notes:
          'Lord remove from me some of the taste for the finer things of life. I have gotten to experience so many over the years. But I don’t want to fall into the trap of idolizing those things or finding value in them that exceeds my relationship with you.',
        children: [{ name: 'Budget' }, { name: 'Investments' }, { name: 'Crypto' }],
      },
    ],
  },
  {
    category: 'work',
    roots: [
      {
        name: 'Business — clients',
        children: [{ name: 'Shilo' }, { name: 'Validators' }, { name: 'Yarash' }],
      },
      {
        name: 'Friends’ businesses / potential clients',
        children: [{ name: 'JW Supply' }, { name: 'Mr. Charles — A Plus Environmental, Normandy' }],
      },
    ],
  },
];

const SEED_MARKER = 'seed:journal-2025';

async function clearPreviousSeed() {
  const { data: seeded } = await supabase
    .from('prayer_subjects')
    .select('id')
    .eq('user_id', U)
    .contains('scripture_refs', [SEED_MARKER]);

  if (seeded?.length) {
    // Cascade removes descendants and their requests.
    await supabase.from('prayer_subjects').delete().in('id', seeded.map((s) => s.id));
    console.log(`cleared ${seeded.length} previously seeded root(s)`);
  }
}

let subjectCount = 0;
let requestCount = 0;

async function insertSeed(
  seed: Seed,
  category: Category,
  parentId: string | null,
  position: number,
  isRoot: boolean
): Promise<void> {
  const refs = [...(seed.scripture ?? [])];
  if (isRoot) refs.push(SEED_MARKER);

  const { data, error } = await supabase
    .from('prayer_subjects')
    .insert({
      user_id: U,
      parent_id: parentId,
      name: seed.name,
      category,
      notes: seed.notes ?? null,
      scripture_refs: refs,
      position,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error(`  failed on "${seed.name}": ${error?.message}`);
    return;
  }
  subjectCount++;

  if (seed.requests?.length) {
    const rows = seed.requests.map((body) => ({
      user_id: U,
      subject_id: data.id,
      body,
      status: 'open',
    }));
    const { error: reqError } = await supabase.from('prayer_requests').insert(rows);
    if (reqError) console.error(`  requests for "${seed.name}": ${reqError.message}`);
    else requestCount += rows.length;
  }

  const children = seed.children ?? [];
  for (let i = 0; i < children.length; i++) {
    await insertSeed(children[i], category, data.id, i, false);
  }
}

await clearPreviousSeed();

for (const { category, roots } of JOURNAL) {
  for (let i = 0; i < roots.length; i++) {
    await insertSeed(roots[i], category, null, i, true);
  }
  console.log(`${category}: seeded`);
}

console.log(`\n${subjectCount} subjects, ${requestCount} specific requests`);

const { count } = await supabase
  .from('prayer_requests')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', U);
console.log(`prayer_requests total: ${count}`);
