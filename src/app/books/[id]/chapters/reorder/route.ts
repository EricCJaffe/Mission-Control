import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { stripChapterPrefix } from "@/lib/text";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ordered = Array.isArray(body?.ordered_ids) ? body.ordered_ids : [];

  if (ordered.length === 0) return NextResponse.json({ ok: true });

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id,title")
    .in("id", ordered);

  const titleMap = new Map((chapters || []).map((ch) => [ch.id, ch.title]));

  const updates = ordered.map((id: string, idx: number) => {
    const currentTitle = titleMap.get(id) || "";
    const cleanedTitle = stripChapterPrefix(currentTitle);
    const payload: Record<string, unknown> = { position: idx + 1 };
    if (cleanedTitle !== currentTitle) payload.title = cleanedTitle;
    return supabase.from("chapters").update(payload).eq("id", id);
  });

  await Promise.all(updates);

  return NextResponse.json({ ok: true });
}
