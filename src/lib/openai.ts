/**
 * Text generation for the app's AI features.
 *
 * Backed by Claude (Anthropic SDK) since 2026-10-30; it was OpenAI's Responses
 * API before. The export keeps its old name so the ~60 call sites did not have
 * to change. Any OpenAI model id passed in (OPENAI_MODEL, "gpt-5.2",
 * "gpt-4o-mini") is mapped to a Claude model by claudeModel(): "*-mini" goes
 * to the fast model, everything else to the smart one. Set ANTHROPIC_MODEL /
 * ANTHROPIC_FAST_MODEL to override.
 *
 * Embeddings (src/lib/ai/embeddings.ts) still use OpenAI: Anthropic has no
 * embeddings API.
 */
import Anthropic from "@anthropic-ai/sdk";
import { chatCompletion, claudeModel } from "@/lib/claude";

function explainClaudeError(err: unknown, model: string): string {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 401) return "ANTHROPIC_API_KEY was rejected. Check the key in Vercel.";
    if (err.status === 429) return "Claude rate limit or quota reached. Try again shortly.";
    if (err.status === 404 || /model/i.test(err.message)) {
      return `Model "${claudeModel(model)}" was rejected by the Anthropic API (${err.message}). Check ANTHROPIC_MODEL.`;
    }
    return err.message || `Claude error ${err.status}`;
  }
  return err instanceof Error ? err.message : String(err);
}

export async function callOpenAI({
  model,
  system,
  user,
  maxTokens = 16000,
}: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }
  let output = "";
  try {
    const res = await chatCompletion({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    output = res.choices[0]?.message?.content?.trim() ?? "";
  } catch (err) {
    throw new Error(explainClaudeError(err, model));
  }
  if (!output) {
    throw new Error("Claude returned empty response");
  }
  return output;
}

/** Alias with an accurate name, for new code. */
export const callClaude = callOpenAI;
