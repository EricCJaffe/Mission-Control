import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const personaId = String(form.get("persona_id") || "").trim();
  const soulId = String(form.get("soul_id") || "").trim();
  const personaContent = String(form.get("persona_content") || "");
  const soulContent = String(form.get("soul_content") || "");
  const timestamp = new Date().toISOString();

  if (personaId) {
    await supabase
      .from("notes")
      .update({
        content_md: personaContent,
        tags: ["knowledge", "persona"],
        updated_at: timestamp,
      })
      .eq("id", personaId);
  } else {
    await supabase.from("notes").insert({
      user_id: user.id,
      title: "persona",
      content_md: personaContent,
      tags: ["knowledge", "persona"],
    });
  }

  if (soulId) {
    await supabase
      .from("notes")
      .update({
        content_md: soulContent,
        tags: ["knowledge", "soul"],
        updated_at: timestamp,
      })
      .eq("id", soulId);
  } else {
    await supabase.from("notes").insert({
      user_id: user.id,
      title: "soul",
      content_md: soulContent,
      tags: ["knowledge", "soul"],
    });
  }

  return NextResponse.redirect(new URL("/knowledge", req.url));
}
