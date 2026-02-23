import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AnnualReviewTemplatePage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const now = new Date();
  const year = now.getFullYear();
  const title = `Annual Review ${year}`;

  const template = `# Annual Review — ${year}

## 1) Mission & Values Alignment
- God First:
- Health:
- Family:
- Impact:

## 2) Highlights & Wins
- Spirit:
- Soul:
- Body:
- Impact:

## 3) Biggest Challenges
- What cost the most?
- What was the hardest lesson?

## 4) Lessons Learned
- 

## 5) Systems Review
- What systems worked?
- What systems failed?
- What must be rebuilt?

## 6) Goals & Outcomes
- Goals completed:
- Goals missed:
- Why?

## 7) Next Year Vision
- 3–7 top goals:
1.
2.
3.
4.
5.

## 8) Quarterly Themes
- Q1:
- Q2:
- Q3:
- Q4:

## 9) Commitments
- Family:
- Health:
- Impact:

## 10) Prayer Targets
- 
`;

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Annual Review Template</h1>
        <p className="mt-1 text-sm text-slate-500">Create a structured annual review note.</p>
      </div>

      <form className="mt-6 grid gap-4" action="/notes/new" method="post" data-toast="Annual review note created">
        <input className="rounded-xl border border-slate-200 bg-white px-3 py-2" name="title" defaultValue={title} required />
        <textarea className="min-h-[320px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" name="content_md" defaultValue={template} />
        <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
          Create Annual Review Note
        </button>
      </form>
    </main>
  );
}
