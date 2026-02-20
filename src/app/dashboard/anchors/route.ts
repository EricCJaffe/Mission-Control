import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const date = String(form.get("date") || "").trim();
  if (!date) return NextResponse.redirect(new URL("/dashboard", req.url));

  const prayer = form.get("prayer") === "on";
  const training = form.get("training") === "on";
  const familyTouchpoint = form.get("family_touchpoint") === "on";

  await supabase.from("daily_anchors").upsert(
    {
      user_id: user.id,
      date,
      prayer,
      training,
      family_touchpoint: familyTouchpoint,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date" }
  );

  return NextResponse.redirect(new URL("/dashboard", req.url));
}
