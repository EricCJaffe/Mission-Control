/*
 * GitHub issue harvesting.
 *
 * The network half — shelling out to `gh` — is deliberately not tested here.
 * It was verified once against cli/cli, which returned 200 issues with labels
 * and assignees parsed correctly, and a test that hits GitHub on every run
 * would be slow, rate-limited and offline-fragile. What IS tested is the
 * classification, which is where the judgement lives and where a wrong answer
 * quietly changes what reaches the task list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueIsMine, ghReady, fetchIssues, type IssueTask } from '../lib/issues.ts';
import type { Repo } from '../lib/repos.ts';

const MY_LOGINS = ['ericcjaffe', 'eric'];

function issue(over: Partial<IssueTask> = {}): IssueTask {
  return {
    number: 1,
    title: 'Something is broken',
    body: '',
    url: 'https://github.com/owner/repo/issues/1',
    assignees: [],
    labels: [],
    priority: 2,
    ...over,
  };
}

test('an issue assigned to me is mine', () => {
  assert.equal(issueIsMine(issue({ assignees: ['ericcjaffe'] }), MY_LOGINS), true);
});

test('an unassigned issue is mine', () => {
  // Not somebody else's work — work nobody has picked up, which is exactly
  // what a master checklist should surface rather than hide.
  assert.equal(issueIsMine(issue({ assignees: [] }), MY_LOGINS), true);
});

test("an issue assigned to somebody else is not mine", () => {
  assert.equal(issueIsMine(issue({ assignees: ['joey358'] }), MY_LOGINS), false);
});

test('a shared assignment counts as mine', () => {
  assert.equal(issueIsMine(issue({ assignees: ['joey358', 'ericcjaffe'] }), MY_LOGINS), true);
});

test('a repo with no GitHub remote yields nothing without calling out', () => {
  // Every project under ~/dev gets harvested; the ones with no remote must
  // not fail the run or hang it on a network call that cannot succeed.
  const repo: Repo = { slug: 'local', path: '/tmp', branch: 'main', githubRepo: null };
  assert.deepEqual(fetchIssues(repo), []);
});

test('a repo the account cannot see yields nothing rather than throwing', () => {
  // A private repo, a renamed remote, a revoked token. The project harvest is
  // the valuable part and must survive any of them.
  const repo: Repo = {
    slug: 'nope',
    path: '/tmp',
    branch: 'main',
    githubRepo: 'this-owner-does-not-exist-mc/this-repo-does-not-exist-mc',
  };
  assert.deepEqual(fetchIssues(repo), []);
});

test('ghReady answers the same way twice', () => {
  // It caches, because it is asked once per repo and `gh auth status` is not
  // free. Whatever the answer is on this machine, it must be stable.
  assert.equal(ghReady(), ghReady());
});
