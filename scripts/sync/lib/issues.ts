/*
 * GitHub issues, through the `gh` CLI rather than the API.
 *
 * `gh` is already authenticated on this box against the account that can see
 * all three orgs, and its token lives in the system keyring. Reaching for the
 * REST API instead would mean putting a second GitHub credential in
 * sync.env — a new secret on disk to buy nothing.
 *
 * SKIPS SILENTLY WHEN IT CANNOT WORK. No `gh`, not logged in, no GitHub
 * remote, a repo the account cannot see: all of these return an empty list
 * rather than failing the run. The project harvest is the valuable part and it
 * should not be lost because one repo's remote moved.
 */

import { execFileSync } from 'node:child_process';
import type { Repo } from './repos.ts';

export type IssueTask = {
  number: number;
  title: string;
  body: string;
  url: string;
  assignees: string[];
  labels: string[];
  priority: number;
};

/** Labels that mean "now", across the conventions the repos actually use. */
const URGENT_LABELS = /^(p0|p1|urgent|critical|blocker|blocked|security|bug:critical)$/i;
const LOW_LABELS = /^(p3|low|later|someday|backlog|wontfix|nice-to-have)$/i;

let ghAvailable: boolean | null = null;

/** Whether `gh` exists and is logged in. Answered once per run. */
export function ghReady(): boolean {
  if (ghAvailable !== null) return ghAvailable;
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: 'ignore', timeout: 10_000 });
    ghAvailable = true;
  } catch {
    ghAvailable = false;
  }
  return ghAvailable;
}

function priorityFor(labels: string[]): number {
  if (labels.some((l) => URGENT_LABELS.test(l))) return 1;
  if (labels.some((l) => LOW_LABELS.test(l))) return 3;
  return 2;
}

/**
 * Open issues in a repo.
 *
 * Pull requests are excluded by `gh issue list` itself. The 200 cap is a guard
 * against a repo with a very long backlog turning one sync into a long one; the
 * filter that matters is applied by the caller.
 */
export function fetchIssues(repo: Repo): IssueTask[] {
  if (!repo.githubRepo || !ghReady()) return [];

  let raw: string;
  try {
    raw = execFileSync(
      'gh',
      [
        'issue',
        'list',
        '--repo',
        repo.githubRepo,
        '--state',
        'open',
        '--limit',
        '200',
        '--json',
        'number,title,body,url,assignees,labels',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 30_000 },
    );
  } catch {
    // A private repo the account cannot read, a renamed remote, a network
    // blip. None of these are worth failing the whole sync over.
    return [];
  }

  let parsed: Array<{
    number: number;
    title: string;
    body?: string;
    url: string;
    assignees?: Array<{ login: string }>;
    labels?: Array<{ name: string }>;
  }>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  return parsed.map((issue) => {
    const labels = (issue.labels ?? []).map((l) => l.name);
    return {
      number: issue.number,
      title: issue.title,
      // Issue bodies run long and the task list only needs enough to recognise
      // it; the link goes to the real thing.
      body: (issue.body ?? '').trim().slice(0, 1000),
      url: issue.url,
      assignees: (issue.assignees ?? []).map((a) => a.login.toLowerCase()),
      labels,
      priority: priorityFor(labels),
    };
  });
}

/**
 * Whether an issue is Eric's to look at.
 *
 * Unassigned counts. On these repos an unassigned open issue is not somebody
 * else's work — it is work nobody has picked up, which is exactly the thing a
 * master checklist should surface.
 */
export function issueIsMine(issue: IssueTask, logins: string[]): boolean {
  if (issue.assignees.length === 0) return true;
  return issue.assignees.some((a) => logins.includes(a));
}
