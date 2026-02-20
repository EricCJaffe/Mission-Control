import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

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

  // Scaffold: build the prompt and return a stub response for now.
  return NextResponse.json({
    ok: true,
    mode,
    prompt,
    context: {
      personaLength: persona.length,
      soulLength: soul.length,
    },
    message: "OpenAI integration scaffolded. Wire model calls here.",
  });
}
