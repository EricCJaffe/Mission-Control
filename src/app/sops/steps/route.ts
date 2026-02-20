import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const sopId = String(form.get("sop_id") || "").trim();
  const step = String(form.get("step") || "").trim();
  const dueDate = String(form.get("due_date") || "").trim();

  if (!sopId || !step) return NextResponse.redirect(new URL("/sops", req.url));

  await supabase.from("sop_checks").insert({
    user_id: user.id,
    sop_id: sopId,
    step,
    due_date: dueDate || null,
  });

  return NextResponse.redirect(new URL(`/sops/${sopId}`, req.url));
}
