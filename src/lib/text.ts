export function stripChapterPrefix(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  const cleaned = trimmed.replace(/^\s*(chapter|ch)\s*\d+\s*[:.\-–—]?\s*/i, "");
  return cleaned.trim();
}
