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

  const [personaResult, soulResult, flourishingResult] = await Promise.all([
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
    supabase
      .from("flourishing_profiles")
      .select("display_index,overall_message,strongest_domains,growth_domains")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const persona = personaResult.data?.content_md || "";
  const soul = soulResult.data?.content_md || "";
  const flourishing = flourishingResult.data
    ? `Flourishing Index: ${flourishingResult.data.display_index ?? 'N/A'}/10\nSummary: ${flourishingResult.data.overall_message ?? 'N/A'}\nStrongest: ${(flourishingResult.data.strongest_domains || []).join(', ')}\nGrowth: ${(flourishingResult.data.growth_domains || []).join(', ')}`
    : "";

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        ok: false,
        error: "OPENAI_API_KEY not configured",
        context: { personaLength: persona.length, soulLength: soul.length, flourishingLength: flourishing.length },
        hint: "Set OPENAI_API_KEY on the server to enable responses.",
      },
      { status: 501 }
    );
  }

  let responseText = "";
  try {
    responseText = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      system: `You are an assistant aligned to the persona, soul, and flourishing context.\nPersona:\n${persona}\nSoul:\n${soul}\nFlourishing:\n${flourishing}`,
      user: `Mode: ${mode}\nPrompt: ${prompt}`,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "ai_error" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mode,
    prompt,
    message: responseText,
    context: {
      personaLength: persona.length,
      soulLength: soul.length,
      flourishingLength: flourishing.length,
    },
  });
}
