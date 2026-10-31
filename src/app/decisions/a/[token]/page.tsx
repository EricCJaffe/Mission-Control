import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { checkLinkUse, LINK_ERROR_TEXT, verifyLinkToken } from "@/lib/decisions/link-token";
import type { DecisionOption } from "@/lib/decisions/answer";
import LinkAnswer from "@/components/decisions/LinkAnswer";

export const dynamic = "force-dynamic";

/*
 * Where a one-click link in the decisions email digest lands. The middleware
 * has already required Eric's session (a mail scanner gets the login page), so
 * this checks the link, shows which answer it is recording, and submits it
 * once through the same /api/decisions/[id]/answer endpoint as /decisions.
 * docs/decisions-inbox.md, "Email digest".
 */
export default async function DecisionLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken);
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const link = verifyLinkToken(token, process.env.DECISIONS_LINK_SECRET);
  let refusal: string | null = link.ok ? null : LINK_ERROR_TEXT[link.error];
  let title = "";
  let label = "";
  let answer = "";
  let id = "";

  if (link.ok) {
    const { data: row } = await supabase
      .from("decisions")
      .select("id, title, status, answered_at, options")
      .eq("id", link.claims.id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!row) {
      refusal = LINK_ERROR_TEXT.missing;
    } else {
      const options = (row.options ?? []) as DecisionOption[];
      const use = checkLinkUse(link.claims, { ...row, options });
      title = row.title;
      if (!use.ok) refusal = LINK_ERROR_TEXT[use.error];
      else {
        id = row.id;
        answer = link.claims.answer;
        label = options.find((o) => o.id === answer)?.label ?? answer;
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-8">
      <h1 className="text-xl font-semibold text-slate-900">{title || "Decision"}</h1>
      {refusal ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{refusal}</p>
      ) : (
        <LinkAnswer id={id} answer={answer} label={label} token={token} />
      )}
      <Link href="/decisions" className="inline-block text-sm text-blue-700 underline">
        Open all decisions
      </Link>
    </main>
  );
}
