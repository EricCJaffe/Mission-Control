import Link from 'next/link'
import { Lightbulb, Compass } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { idleDays, idleLabel, idleTone, type IdeaRow } from '@/lib/ideas'

export const dynamic = 'force-dynamic'

/*
 * The idea board.
 *
 * Eric, 2026-09-19: "i always seem to have ideas and dont want to forget them
 * ... simple functionality like a mini to do- no due date."
 *
 * NO DUE DATE, ANYWHERE ON THIS PAGE. That is the feature, not an omission.
 * The only clock is how long an idea has gone untouched, and the only verbs
 * are the four a person actually uses on an idea: still alive, make it real,
 * park it, kill it.
 *
 * Plain form posts and no client component, matching /projects. There is no
 * state here worth hydrating a bundle for.
 */

const DOMAINS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Unsorted' },
  { value: 'spirit', label: 'God First' },
  { value: 'body', label: 'Health — body' },
  { value: 'soul', label: 'Health — soul' },
  { value: 'family', label: 'Family' },
  { value: 'work', label: 'Impact' },
]

const DOMAIN_LABEL: Record<string, string> = {
  spirit: 'God First',
  body: 'Health',
  soul: 'Health',
  family: 'Family',
  work: 'Impact',
}

const TONE_CLASS: Record<string, string> = {
  fresh: 'bg-slate-100 text-slate-600',
  aging: 'bg-yellow-50 text-yellow-800',
  stale: 'bg-red-50 text-red-700',
}

function IdleBadge({ touchedAt }: { touchedAt: string }) {
  const days = idleDays(touchedAt)
  const tone = idleTone(days)
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {days === 0 ? 'touched today' : `idle ${idleLabel(days)}`}
    </span>
  )
}

export default async function IdeasPage() {
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const { data, error } = await supabase
    .from('ideas')
    .select(
      'id,title,body,domain,status,captured_at,touched_at,touch_count,promoted_project_id,promoted_at,source,source_url,promote_request,promote_requested_at,promote_error',
    )
    .order('touched_at', { ascending: true })
    .limit(500)

  const ideas = (data ?? []) as IdeaRow[]
  const open = ideas.filter((i) => i.status === 'open')
  const parked = ideas.filter((i) => i.status === 'parked')
  const promoted = ideas
    .filter((i) => i.status === 'promoted')
    .sort((a, b) => (b.promoted_at ?? '').localeCompare(a.promoted_at ?? ''))

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-semibold">
          <Lightbulb className="h-7 w-7 text-yellow-500" />
          Ideas
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Caught, not committed. No due dates — the only clock is how long each one has gone
          untouched, and the weekly brief puts the oldest back in front of you.
        </p>
      </div>

      {/* Capture first, above everything. An idea board you have to scroll to
          is an idea board you stop using. */}
      <form className="mt-6 grid gap-2 sm:grid-cols-[1fr_auto_auto]" action="/ideas/new" method="post">
        <input
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
          name="title"
          placeholder="What just occurred to you…"
          required
          autoFocus
        />
        <select
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
          name="domain"
          defaultValue=""
        >
          {DOMAINS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <button
          className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
          type="submit"
        >
          Catch it
        </button>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading ideas: {error.message}
        </div>
      )}

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">
          Open ({open.length}) — oldest attention first
        </h2>
        <div className="mt-3 grid gap-3">
          {open.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
          {open.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-sm text-slate-500">
              Nothing caught yet. Type it above, or say <code>/idea</code> to Claude from any
              session.
            </div>
          )}
        </div>
      </section>

      {parked.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Parked ({parked.length})
          </h2>
          <div className="mt-3 grid gap-3">
            {parked.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        </section>
      )}

      {promoted.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Became projects ({promoted.length})
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Kept on purpose. This list is the only honest argument for capturing ideas at all.
          </p>
          <div className="mt-3 grid gap-2">
            {promoted.map((idea) => (
              <div
                key={idea.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
              >
                <span className="font-medium text-slate-700">{idea.title}</span>
                <Link
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-xs text-blue-700 hover:bg-slate-50"
                  href={`/tasks?project=${idea.promoted_project_id}`}
                >
                  <Compass className="h-3 w-3" />
                  Open the project
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}

function IdeaCard({ idea }: { idea: IdeaRow }) {
  const captured = new Date(idea.captured_at).toLocaleDateString()

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold">{idea.title}</div>
          {idea.body && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{idea.body}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {idea.domain && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {DOMAIN_LABEL[idea.domain] ?? idea.domain}
            </span>
          )}
          <IdleBadge touchedAt={idea.touched_at} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>caught {captured}</span>
        {idea.touch_count > 0 && <span>revisited {idea.touch_count}x</span>}
        {idea.source === 'idea_skill' && <span className="text-slate-400">via /idea</span>}
        {idea.source_url && (
          <a className="text-blue-700 hover:underline" href={idea.source_url}>
            source
          </a>
        )}
        {/* Queued, not promoted. The box creates the fsaos project within a few
            minutes; saying so is the price of not holding an fsaos key here. */}
        {idea.promote_request === 'fsaos' && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
            queued for fsaos
          </span>
        )}
        {idea.promote_error && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
            promotion failed: {idea.promote_error}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={`/ideas/${idea.id}/touch`} method="post">
          <button
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            type="submit"
          >
            Still alive
          </button>
        </form>

        {idea.status === 'open' ? (
          <form action={`/ideas/${idea.id}/status`} method="post">
            <input type="hidden" name="status" value="parked" />
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              type="submit"
            >
              Park
            </button>
          </form>
        ) : (
          <form action={`/ideas/${idea.id}/status`} method="post">
            <input type="hidden" name="status" value="open" />
            <button
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              type="submit"
            >
              Reopen
            </button>
          </form>
        )}

        <form action={`/ideas/${idea.id}/status`} method="post">
          <input type="hidden" name="status" value="killed" />
          <button
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-700"
            type="submit"
          >
            Kill
          </button>
        </form>
      </div>

      {/* Conversion is deliberately two steps: the first names the tasks. An
          idea promoted to an empty project is a rename, not a decision. */}
      <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-xs font-medium text-blue-700">
          Make it a project
        </summary>
        <form className="mt-3 grid gap-2" action={`/ideas/${idea.id}/promote`} method="post">
          <label className="text-xs text-slate-600">
            First tasks, one per line. Leave blank for an empty project.
          </label>
          <textarea
            className="min-h-[72px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            name="tasks"
            placeholder={'Sketch the one-pager\nAsk Joey what it would take'}
          />
          {/* Where it lands. Mission Control is made here and now; fsaos is
              queued for the box, because this app holds no fsaos credentials
              and should not. */}
          <label className="text-xs text-slate-600" htmlFor={`target-${idea.id}`}>
            Where it goes
          </label>
          <select
            id={`target-${idea.id}`}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            name="target"
            defaultValue="mission"
          >
            <option value="mission">Mission Control — mine, right now</option>
            <option value="fsaos">fsaos — Foundation Stone, in a few minutes</option>
          </select>
          <div>
            <button
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm"
              type="submit"
            >
              Create the project
            </button>
          </div>
        </form>
      </details>

      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-slate-500">Edit</summary>
        <form className="mt-2 grid gap-2" action={`/ideas/${idea.id}/edit`} method="post">
          <input
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            name="title"
            defaultValue={idea.title}
            required
          />
          <textarea
            className="min-h-[72px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            name="body"
            defaultValue={idea.body ?? ''}
            placeholder="The fuller thought…"
          />
          <select
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
            name="domain"
            defaultValue={idea.domain ?? ''}
          >
            {DOMAINS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
          <div>
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
              type="submit"
            >
              Save
            </button>
          </div>
        </form>
      </details>
    </div>
  )
}
