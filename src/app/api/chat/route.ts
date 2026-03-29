import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import fs from "fs/promises";
import path from "path";

type Message = { role: "user" | "assistant"; content: string };

async function loadContextFile(filename: string): Promise<string> {
  try {
    const filePath = path.join(process.cwd(), "docs", filename);
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

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

  const [persona, soul, health] = await Promise.all([
    loadContextFile("persona.md"),
    loadContextFile("soul.md"),
    loadContextFile("health.md"),
  ]);

  const systemPrompt = `You are Eric's personal AI assistant inside Mission Control. You have deep knowledge of who Eric is, his health situation, his values, and his mission. Be direct, practical, and aligned with his priority matrix: God First, Health, Family, Impact.

When answering health questions, be thorough but always include the caveat to consult his doctors (especially Dr. Chandler for cardiac). Never recommend anything that conflicts with his medications or training constraints.

Speak in a tone that matches Eric's style: direct, urgent, hopeful, practical. Use short sections and bullets when helpful. Always be honest — no fluff.

--- PERSONA CONTEXT ---
${persona}

--- SOUL CONTEXT ---
${soul}

--- HEALTH PROFILE ---
${health}
`;

  const input = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 },
    );
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      input,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    return NextResponse.json(
      { error: errorText || `OpenAI error ${res.status}` },
      { status: 502 },
    );
  }

  // Stream the response back to the client
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              // Responses API streaming: look for output_text.delta
              if (parsed.type === "response.output_text.delta") {
                const delta = parsed.delta || "";
                controller.enqueue(encoder.encode(delta));
              }
            } catch {
              // skip unparseable lines
            }
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
