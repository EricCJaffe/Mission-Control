# AGENTS.md — Mission Control (Codex)

## What this project is

Mission Control is a personal-first Next.js app for tasks, goals, reviews, calendar, book writing, sermon building, and fitness tracking with cardiac-awareness.

## How Codex should work in this repo

- Prefer small, reviewable changes. If large, propose a plan first.
- Use server components for data fetching; client components only for interactivity.
- Respect the repo's styling and folder conventions (see below).
- Keep docs in sync with code changes (same commit when possible).

## Quick Start

```bash
npm install
npm run dev        # http://localhost:3000
npm run lint       # ESLint
npx tsc --noEmit   # TypeScript check (no test suite configured)
```
