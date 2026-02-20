import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { applyPatch } from "@/lib/ai/tools";
import { getPersonaProfile } from "@/lib/ai/persona";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const chapterId = String(body.chapter_id || "");
  const patch = String(body.patch || "");

  if (!chapterId || !patch) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  const persona = await getPersonaProfile(user.id);
  const result = await applyPatch(chapterId, patch);

  return NextResponse.json({
    ok: result.ok,
    markdown: result.markdown,
    persona,
  });
}
