import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULT_PERSONA = `# Persona

## Mission
- What are you called to build?
- What is the unique edge you bring?

## Strengths
- Core competencies
- Trusted patterns

## Constraints
- Non-negotiables
- Boundaries that protect focus
`;

const DEFAULT_SOUL = `# Soul

## Alignment
- What restores you?
- What drains you?

## Relationships
- People to invest in
- People to ask for help

## Emotional Weather
- What are you feeling today?
- What needs prayer or attention?
`;

export default async function KnowledgePage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [personaResult, soulResult] = await Promise.all([
    supabase
      .from("notes")
      .select("id,title,content_md,tags,updated_at")
      .eq("title", "persona")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("notes")
      .select("id,title,content_md,tags,updated_at")
      .eq("title", "soul")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const persona = personaResult.data;
  const soul = soulResult.data;

  const adminEmail = process.env.ADMIN_EMAIL;
  const isAdmin = adminEmail ? user.email === adminEmail : true;

  return (
    <main className="pt-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Knowledge</h1>
          <p className="mt-1 text-sm text-slate-500">
            Persona + Soul anchors. These feed alignment and future AI prompts.
          </p>
        </div>
        {adminEmail && (
          <div className="text-xs text-slate-500">
            Admin email: {adminEmail}
          </div>
        )}
      </div>

      <form className="mt-6 grid gap-4" action="/knowledge/save" method="post">
        <input type="hidden" name="persona_id" value={persona?.id || ""} />
        <input type="hidden" name="soul_id" value={soul?.id || ""} />

        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <label className="text-xs uppercase tracking-wide text-slate-500">Persona</label>
          <textarea
            className="mt-2 min-h-[260px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
            name="persona_content"
            defaultValue={persona?.content_md || DEFAULT_PERSONA}
          />
        </div>

        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <label className="text-xs uppercase tracking-wide text-slate-500">Soul</label>
          <textarea
            className="mt-2 min-h-[260px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-sm"
            name="soul_content"
            defaultValue={soul?.content_md || DEFAULT_SOUL}
          />
        </div>

        <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
          Save Knowledge
        </button>
      </form>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        {isAdmin ? (
          <form action="/knowledge/export" method="post">
            <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" type="submit">
              Export to Vault
            </button>
          </form>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white/70 px-4 py-2 text-xs text-slate-500">
            Export is admin-only.
          </div>
        )}

        <form action="/knowledge/import" method="post">
          <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm" type="submit">
            Import from Vault
          </button>
        </form>
      </div>
    </main>
  );
}
