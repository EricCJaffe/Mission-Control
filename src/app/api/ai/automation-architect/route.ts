import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const goal = String(body.goal || "").trim();
  const context = String(body.context || "").trim();
  const systems = String(body.systems || "").trim();
  const constraints = String(body.constraints || "").trim();
  const saveNote = Boolean(body.save_note);
  const saveSop = Boolean(body.save_sop);
  const title = String(body.title || "").trim() || "Automation Architect Plan";
  const tags = Array.isArray(body.tags) ? body.tags : [];

  if (!goal) {
    return NextResponse.json({ error: "missing_goal" }, { status: 400 });
  }

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

  let output = "";
  try {
    output = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      system: `You are the Automation Architect for Mission Control. Align to the persona and soul context. Provide actionable steps, systems, triggers, data fields, approvals, error handling, and success criteria.\nPersona:\n${persona}\nSoul:\n${soul}`,
      user: `Goal:\n${goal}\n\nContext:\n${context}\n\nSystems/Tools:\n${systems}\n\nConstraints:\n${constraints}\n\nReturn markdown with these sections:\n- Overview\n- Inputs\n- Workflow (step-by-step)\n- Triggers\n- Data Schema\n- Human-in-the-loop approvals\n- Error handling\n- Metrics/Success criteria\n- Next actions\n- SOP Draft`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "ai_error" }, { status: 500 });
  }

  let noteId: string | null = null;
  let sopId: string | null = null;

  if (saveNote) {
    const { data: note } = await supabase
      .from("notes")
      .insert({
        user_id: user.id,
        title,
        status: "inbox",
        tags,
        content_md: output,
      })
      .select("id")
      .single();
    noteId = note?.id || null;
  }

  if (saveSop) {
    const { data: sop } = await supabase
      .from("sop_docs")
      .insert({
        user_id: user.id,
        title,
        content_md: output,
        status: "active",
      })
      .select("id")
      .single();
    sopId = sop?.id || null;
  }

  return NextResponse.json({ ok: true, output, noteId, sopId });
}
