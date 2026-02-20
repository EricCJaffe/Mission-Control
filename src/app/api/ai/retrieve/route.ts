import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { retrieveContext } from "@/lib/ai/tools";
import { getPersonaProfile } from "@/lib/ai/persona";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const scopeType = String(body.scope_type || "");
  const scopeId = String(body.scope_id || "");
  const query = String(body.query || "");

  if (!scopeType || !scopeId) return NextResponse.json({ error: "missing" }, { status: 400 });

  const persona = await getPersonaProfile(user.id);
  const context = await retrieveContext(scopeType, scopeId, query);

  return NextResponse.json({ ok: true, persona, context });
}
