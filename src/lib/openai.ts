const OPENAI_URL = "https://api.openai.com/v1/responses";

export type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type: string; text?: string }> }>;
};

function extractOutputText(payload: OpenAIResponse) {
  if (payload.output_text) return payload.output_text;
  if (payload.output && payload.output.length > 0) {
    const texts = payload.output
      .flatMap((o) => o.content || [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text as string);
    return texts.join("\n").trim();
  }
  return "";
}

export async function callOpenAI({
  model,
  system,
  user,
}: {
  model: string;
  system: string;
  user: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: system }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: user }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `OpenAI error ${res.status}`);
  }

  const data = (await res.json()) as OpenAIResponse;
  return extractOutputText(data);
}
