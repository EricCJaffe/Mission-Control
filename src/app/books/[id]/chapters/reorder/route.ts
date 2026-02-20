import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ordered = Array.isArray(body?.ordered_ids) ? body.ordered_ids : [];

  if (ordered.length === 0) return NextResponse.json({ ok: true });

  const updates = ordered.map((id: string, idx: number) =>
    supabase.from("chapters").update({ position: idx + 1 }).eq("id", id)
  );

  await Promise.all(updates);

  return NextResponse.json({ ok: true });
}
