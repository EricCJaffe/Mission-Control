import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { buildAISystemPrompt } from "@/lib/fitness/health-context";
import { getAnthropic, CLAUDE_SMART_MODEL } from "@/lib/claude";

type Message = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messages } = (await req.json()) as { messages: Message[] };
  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "Messages required" },
      { status: 400 },
    );
  }

  // Persona/soul/health context comes from Supabase via buildAISystemPrompt —
  // NOT from reading docs/*.md off disk. Files outside the build trace are not
  // present in the Vercel bundle, so fs reads would silently yield empty
  // context (and drop the hardcoded cardiac safety rules) in production.
  const healthPrompt = await buildAISystemPrompt(user.id, "general_health_query");

  const systemPrompt = `${healthPrompt}

--- ASSISTANT ROLE ---
You are Eric's personal AI assistant inside Mission Control. Be direct, practical, and aligned with his priority matrix: God First, Health, Family, Impact.

When answering health questions, be thorough but always include the caveat to consult his doctors (especially Dr. Chandler for cardiac). Never recommend anything that conflicts with his medications or training constraints.

Speak in a tone that matches Eric's style: direct, urgent, hopeful, practical. Use short sections and bullets when helpful. Always be honest — no fluff.
`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 500 },
    );
  }

  // Claude (was OpenAI's streaming Responses API until 2026-10-30). The client
  // still receives plain text deltas, so nothing downstream changed.
  const claudeStream = getAnthropic().messages.stream({
    model: CLAUDE_SMART_MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of claudeStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
