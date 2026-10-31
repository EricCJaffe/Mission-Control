import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePillarScores } from './spirit-soul-body.ts';
import { pillarSuggestion, pillarSuggestions } from './pillar-suggestions.ts';
import { DOMAIN_SUPPORT } from './domain-support.ts';

// Synthetic scores only.
const scores = (s: Record<string, number>) =>
  computePillarScores(Object.entries(s).map(([domain, score]) => ({ domain, score })));

test('no suggestion for a pillar that is thriving or maintaining', () => {
  const pillars = scores({
    faith_spiritual: 9, meaning_purpose_calling: 8,
    relational: 7, mental_emotional: 6, work_money_time: 6,
    physical_brain: 6,
  });
  assert.deepEqual(pillarSuggestions(pillars), []);
});

test('a lagging pillar points at its weakest domain, with that domain\'s scripture and tips', () => {
  const soul = scores({ relational: 5, mental_emotional: 3, work_money_time: 6 }).find(
    (p) => p.pillar === 'soul',
  )!;
  assert.equal(soul.standing, 'needs_attention');
  const s = pillarSuggestion(soul)!;
  assert.equal(s.domain, 'mental_emotional');
  assert.equal(s.domainLabel, 'Mental & Emotional Health');
  assert.equal(s.domainScore, 3);
  const expected = DOMAIN_SUPPORT.mental_emotional.needs_attention;
  assert.equal(s.scripture.reference, expected.reference);
  assert.deepEqual(s.tips, expected.tips.slice(0, 2));
});

test('tips follow the weakest domain\'s own band, not the pillar\'s', () => {
  // Spirit = 0.6*6 + 0.4*5.5 = 5.8 (needs attention); calling (5.5) is weakest.
  const spirit = scores({ faith_spiritual: 6, meaning_purpose_calling: 5.5 }).find(
    (p) => p.pillar === 'spirit',
  )!;
  assert.equal(spirit.standing, 'needs_attention');
  const s = pillarSuggestion(spirit)!;
  assert.equal(s.domain, 'meaning_purpose_calling');
  assert.deepEqual(s.tips, DOMAIN_SUPPORT.meaning_purpose_calling.needs_attention.tips.slice(0, 2));

  const lowPillarSteadyDomain = { ...spirit, contributing: [{ domain: 'faith_spiritual' as const, score: 6 }] };
  assert.deepEqual(
    pillarSuggestion(lowPillarSteadyDomain)!.tips,
    DOMAIN_SUPPORT.faith_spiritual.steady.tips.slice(0, 2),
  );
});

test('unscored pillar gives no suggestion', () => {
  const body = scores({ faith_spiritual: 2 }).find((p) => p.pillar === 'body')!;
  assert.equal(body.score, null);
  assert.equal(pillarSuggestion(body), null);
});

test('several lagging pillars come back in Spirit, Soul, Body order', () => {
  const out = pillarSuggestions(
    scores({ faith_spiritual: 4, meaning_purpose_calling: 4, relational: 3, physical_brain: 2 }),
  );
  assert.deepEqual(out.map((s) => s.pillar), ['spirit', 'soul', 'body']);
});

test('tip count is honored', () => {
  const body = scores({ physical_brain: 2 }).find((p) => p.pillar === 'body')!;
  assert.equal(pillarSuggestion(body, 1)!.tips.length, 1);
  assert.equal(pillarSuggestion(body, 0)!.tips.length, 0);
});
