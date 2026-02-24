const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

type EmbeddingResponse = {
  data?: Array<{ embedding: number[] }>;
};

export async function embedTexts(texts: string[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: texts,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `OpenAI error ${res.status}`);
  }

  const data = (await res.json()) as EmbeddingResponse;
  if (!data.data || data.data.length === 0) return [];
  return data.data.map((item) => item.embedding);
}
