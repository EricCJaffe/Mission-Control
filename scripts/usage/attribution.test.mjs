import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attribute, loadMapping, UNATTRIBUTED } from './attribution.mjs';

const map = loadMapping(JSON.parse(readFileSync(new URL('../../config/ai-usage-projects.json', import.meta.url), 'utf8')));
const p = (cwd) => attribute(cwd, map).project;

test('repo under ~/dev maps to its project and client', () => {
  assert.deepEqual(attribute('/home/admxn/dev/fsaos', map), { project: 'fsaos', client: 'FSA (internal)' });
  assert.equal(p('/home/admxn/dev/honeylakeos/src/pages'), 'honeylakeos');
  assert.equal(p('/Users/ericjaffe/dev/EDEN'), 'eden');
  assert.equal(p('/home/admxn/dev/trellisv2'), 'trellis');
  assert.equal(p('/home/admxn/dev/trellisv2-tasks'), 'trellis');
});

test('worktree names resolve to one project', () => {
  assert.equal(p('/home/admxn/.worktrees/verify-fsaos-pr178'), 'fsaos');
  assert.equal(p('/home/admxn/.worktrees/verify-businessos-pr266-abc123'), 'businessos');
  assert.equal(p('/home/admxn/dev/worktrees/grok-review-roll-reverbos'), 'reverbos');
  assert.equal(p('/home/admxn/dev/.worktrees/mission-control/ai-usage-p2'), 'mission-control');
  assert.equal(p('/home/admxn/dev/.worktrees/honeylakeos/saphp'), 'honeylakeos');
  assert.equal(p('/home/admxn/.worktrees/verify-TKOS-pr16'), 'tkos');
});

test('nested agent worktrees, home-level repos and harness paths', () => {
  assert.equal(p('/home/admxn/dev/honeylakeos/.claude/worktrees/agent-aa582d1b'), 'honeylakeos');
  assert.equal(p('/Users/ericjaffe/honeylakeos'), 'honeylakeos');
  assert.equal(p('/Users/ericjaffe/EDEN/app'), 'eden');
  assert.equal(p('/home/admxn/.local/share/dev-harness'), 'dev-harness');
  assert.equal(p('/home/admxn/agents/harness/x'), 'dev-harness');
  assert.equal(p('/Users/ericjaffe/Documents/Codex/2026-09-29/x'), UNATTRIBUTED);
  assert.equal(p('/home/admxn/.claude'), UNATTRIBUTED);
});

test('box workspace clone of a known repo maps; scratch does not', () => {
  assert.equal(p('/workspace/Mission-Control'), 'mission-control');
  assert.equal(p('/workspace'), UNATTRIBUTED);
  assert.equal(p('/workspace/charter'), UNATTRIBUTED);
});

test('unknown, home, dev root and ambiguous paths are unattributed', () => {
  assert.equal(p('/home/admxn'), UNATTRIBUTED);
  assert.equal(p('/home/admxn/dev'), UNATTRIBUTED);
  assert.equal(p('/home/admxn/dev/some-new-repo'), UNATTRIBUTED);
  assert.equal(p('/tmp/x'), UNATTRIBUTED);
  assert.equal(p(''), UNATTRIBUTED);
  assert.equal(p(null), UNATTRIBUTED);
  assert.equal(p('/home/admxn/.worktrees/port-fsaos-to-reverbos'), UNATTRIBUTED);
  assert.equal(p('/home/admxn/.worktrees/mc-pr51'), UNATTRIBUTED);
  assert.equal(attribute('/home/admxn/dev/nope', map).client, null);
});
