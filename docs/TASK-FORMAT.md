# The task format

One way of writing a task, so that eleven repos with different contributors
roll up into one list — and so Mission Control can one day write a completed
status back without guessing which line it means.

This document is the standard. `npm run tasks:lint` enforces it.

## The shape

```
- [ ] `T-a3f9` Wire the Cloudflare DNS check into the deploy [@eric] (P1)
      Raised 28 Aug. Public forms stay unprotected until this is answered.
      RD, 29 Aug: "we don't have access to Cloudflare."
```

That is the whole of it. In order: checkbox, id, title, assignee, priority,
then indented body.

## The seven rules

**1. One task is one line.** It starts at the beginning of a line with `- `
and a checkbox. Anything indented beneath it is that task's body.

**2. The checkbox is the only truth about status.**

| | |
| --- | --- |
| `- [ ]` | open |
| `- [~]` | in progress |
| `- [x]` | done |

Nothing else marks a task done. Not a heading, not strikethrough, not the word
DONE in the title. This is the rule that matters most with several people in a
file: `### Shipped this week` is one person's opinion about a section, and it
silently changes the state of tasks somebody else owns. A heading says what a
group of tasks is *about*. The box says where it *is*.

**3. Every task carries an id**, backticked, immediately after the checkbox.
`T-` and four hex characters: `` `T-a3f9` ``.

It is deliberately meaningless. An id that means something has to be renamed
when the task changes, and then it is not an identity any more. EDEN's file
documents its own `FND-25` collision and gives up on it; two people assigning
sequences will always eventually collide.

An id from an older scheme counts. EDEN's `` `CORE-01` `` and `` `FND-12` ``
already identify their tasks and are referenced in conversation, so the linter
leaves them alone rather than stapling a second id beside them. What matters is
that every task has one, not that they all look alike.

**Nobody types these.** `npm run tasks:lint -- --fix` assigns one to every task
that lacks it. Never edit an id, never reuse one, and never renumber — the id
is what survives the task being reworded, reordered, or moved between
headings, and it is what a future write-back will match on.

**4. The assignee is `[@handle]` at the end of the line.** More than one is
`[@eric] [@rd]`. Unassigned means no bracket at all — do not write
`[@unassigned]`.

Unassigned is a real and useful state. It means nobody has picked this up,
which is exactly what a rollup should surface.

**5. Priority is optional and explicit.** `(P1)` urgent, `(P2)` normal, `(P3)`
later, at the very end of the line. Omitted means P2.

Priority used to be inferred from emoji in headings — 🔴 meant urgent, 🟠 meant
high. That worked until a task moved section, and it meant a heading edit
silently re-prioritised everything under it.

**6. The body is indented, and an indented `-` is not a task.** Two spaces or
more. A bullet list inside a task body is body. Only a line starting at the
margin with a checkbox is a task.

**7. Headings are topics, not states.** `## Forms platform`, `### Cloudflare` —
yes. `### Shipped today`, `## Done`, `### Blocked` — no; use the checkbox and,
for blocked, say so in the body where the reason can go with it.

## What this buys

- **Rollups that are true.** Mission Control shows what each repo actually
  holds, not what a parser guessed.
- **Write-back, later.** With stable ids, ticking a box in Mission Control can
  safely become a one-line edit in the project's own file. Without them it
  never can, because there is no way to be sure which line was meant.
- **Fewer merge conflicts.** One task per line, no shared state in headings, so
  two people working in different sections do not touch the same lines.

## Migrating an existing file

Do it in the project's own session, not from here. Mission Control reads these
files and never writes to them.

```bash
npm run tasks:lint -- path/to/docs/TASKS.md          # report only
npm run tasks:lint -- path/to/docs/TASKS.md --fix    # assign missing ids
```

The `--fix` pass only ever *adds* ids. It will not re-tick boxes, move
assignees or rewrite headings, because those are judgement calls about somebody
else's work — the report names them and a person decides.

## What Mission Control still accepts

The parser stays tolerant of every dialect it found in the wild, and will keep
doing so: `@eric:` prefixes, `**@david**` group headings, strikethrough,
status-bearing headings. A repo that never adopts this standard still rolls up.

Adopting it only makes the rollup exact — and is the price of write-back.
