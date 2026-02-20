import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { generateOutline } from "@/lib/ai/tools";
import { getPersonaProfile } from "@/lib/ai/persona";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const chapterId = String(body.chapter_id || "");

  if (!chapterId) return NextResponse.json({ error: "missing" }, { status: 400 });

  const persona = await getPersonaProfile(user.id);
  const outline = await generateOutline(chapterId);

  return NextResponse.json({ ok: true, outline, persona });
}
