import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const date = String(form.get("date") || "").trim();
  const rankRaw = String(form.get("rank") || "").trim();
  const title = String(form.get("title") || "").trim();
  const domain = String(form.get("domain") || "").trim();

  const rank = Number(rankRaw);
  if (!date || !title || Number.isNaN(rank)) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  await supabase.from("daily_priorities").upsert(
    {
      user_id: user.id,
      date,
      rank,
      domain,
      title,
    },
    { onConflict: "user_id,date,rank" }
  );

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
