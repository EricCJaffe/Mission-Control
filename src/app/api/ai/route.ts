import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  const mode = typeof body?.mode === "string" ? body.mode : "summary";

  const [personaResult, soulResult] = await Promise.all([
    supabase
      .from("notes")
      .select("content_md")
      .eq("title", "persona")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("notes")
      .select("content_md")
      .eq("title", "soul")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const persona = personaResult.data?.content_md || "";
  const soul = soulResult.data?.content_md || "";

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "OPENAI_API_KEY not configured",
        context: { personaLength: persona.length, soulLength: soul.length },
        hint: "Set OPENAI_API_KEY on the server to enable responses.",
      },
      { status: 501 }
    );
  }

  let responseText = "";
  try {
    responseText = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      system: `You are an assistant aligned to the persona and soul context.\nPersona:\n${persona}\nSoul:\n${soul}`,
      user: `Mode: ${mode}\nPrompt: ${prompt}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "ai_error" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mode,
    prompt,
    message: responseText,
    context: {
      personaLength: persona.length,
      soulLength: soul.length,
    },
  });
}
