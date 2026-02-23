import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function quarterOf(date: Date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

export default async function QuarterlyReviewTemplatePage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const now = new Date();
  const year = now.getFullYear();
  const q = quarterOf(now);
  const title = `Quarterly Review ${year} Q${q}`;

  const template = `# Quarterly Review — ${year} Q${q}

## 1) Mission Alignment
- God First:
- Health:
- Family:
- Impact:

## 2) Wins
- Spirit:
- Soul:
- Body:
- Impact:

## 3) Misses / Drift
- What slipped?
- Why did it slip?
- What needs to change?

## 4) Lessons Learned
- Key lesson 1:
- Key lesson 2:
- Key lesson 3:

## 5) Goals Review
- Goals completed:
- Goals in progress:
- Goals to drop:

## 6) Next Quarter Focus (3–5 objectives)
1.
2.
3.
4.
5.

## 7) Keystone Habits
- Start:
- Stop:
- Continue:

## 8) Calendar Blocks
- Monthly review date:
- Weekly planning cadence:
- Deep work blocks:

## 9) Prayer Targets
- 
`;

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Quarterly Review Template</h1>
        <p className="mt-1 text-sm text-slate-500">Create a structured quarterly review note.</p>
      </div>

      <form className="mt-6 grid gap-4" action="/notes/new" method="post" data-toast="Quarterly review note created">
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" defaultValue={title} required />
        <textarea className="min-h-[320px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="content_md" defaultValue={template} />
        <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
          Create Quarterly Review Note
        </button>
      </form>
    </main>
  );
}
