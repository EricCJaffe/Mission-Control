import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { getPersonaProfile } from "@/lib/ai/persona";
import { retrieveContext } from "@/lib/ai/tools";
import { callOpenAI } from "@/lib/openai";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const scopeType = String(body.scope_type || "");
  const scopeId = String(body.scope_id || "");
  const message = String(body.message || "");
  const mode = String(body.mode || "");

  if (!scopeType || !scopeId || !message) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }

  const persona = await getPersonaProfile(user.id);
  const context = await retrieveContext(scopeType, scopeId, message);

  let threadId = body.thread_id ? String(body.thread_id) : "";
  if (!threadId) {
    const { data: thread } = await supabase
      .from("chat_threads")
      .insert({
        scope_type: scopeType,
        scope_id: scopeId,
        org_id: user.id,
        created_by: user.id,
      })
      .select("id")
      .single();
    threadId = thread?.id || "";
  }

  const { data: userMessage } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      org_id: user.id,
      role: "user",
      content: message,
      tool_calls_json: { mode, persona, context },
    })
    .select("id,role,content,created_at")
    .single();

  let aiText = "";
  try {
    aiText = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      system: `You are a writing assistant. Persona: ${persona.title}. Tone: ${persona.tone}. Mission: ${persona.mission_alignment}.`,
      user: `Mode: ${mode}\nScope: ${scopeType}\nContext: ${JSON.stringify(context)}\nUser: ${message}`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "ai_error" }, { status: 500 });
  }

  const { data: assistantMessage } = await supabase
    .from("chat_messages")
    .insert({
      thread_id: threadId,
      org_id: user.id,
      role: "assistant",
      content: aiText || "(empty)",
      tool_calls_json: { mode, persona, context },
    })
    .select("id,role,content,created_at")
    .single();

  return NextResponse.json({
    ok: true,
    thread_id: threadId,
    userMessage,
    assistantMessage,
  });
}
