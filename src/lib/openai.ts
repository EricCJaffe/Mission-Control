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
      .filter((c) => (c.type === "text" || c.type === "output_text") && c.text)
      .map((c) => c.text as string);
    return texts.join("\n").trim();
  }
  return "";
}

/**
 * Turn OpenAI's error body into something that names the actual problem.
 *
 * Raw API JSON reached the UI as-is, which is unreadable, and every caller
 * then replaced it with its own generic message anyway. The case worth calling
 * out by name is a bad model id: OPENAI_MODEL was set to a `-chat-latest`
 * model, which this endpoint does not serve, so every AI feature in the app
 * failed at once and nothing on screen said why.
 */
function explainOpenAIError(body: string, status: number, model: string): string {
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed?.error?.message ?? body;
  } catch {
    // Not JSON — fall through with the raw text.
  }

  if (/model/i.test(message) && /not found|does not exist|invalid/i.test(message)) {
    return `OPENAI_MODEL is set to "${model}", which the API rejected (${message}). Note that the app calls the Responses API, which does not serve "-chat-latest" models.`;
  }
  if (status === 401) return 'OPENAI_API_KEY was rejected. Check the key in Vercel.';
  if (status === 429) return 'OpenAI rate limit or quota reached. Try again shortly.';

  return message || `OpenAI error ${status}`;
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
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(explainOpenAIError(errorText, res.status, model));
  }

  const data = (await res.json()) as OpenAIResponse;
  const output = extractOutputText(data);
  if (!output) {
    throw new Error("OpenAI returned empty response");
  }
  return output;
}
