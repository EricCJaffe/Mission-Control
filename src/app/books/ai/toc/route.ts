import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const bookId = String(form.get("book_id") || "").trim();
  const concept = String(form.get("concept") || "").trim();
  const countRaw = String(form.get("count") || "").trim();
  const count = countRaw ? Number(countRaw) : 10;

  if (!bookId || !concept) return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));

  let outlineText = "";
  try {
    outlineText = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      system: "You are a book editor generating a chapter outline.",
      user: `Concept: ${concept}\nReturn a numbered list of ${Number.isFinite(count) ? count : 10} chapter titles only.`,
    });
  } catch {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
  }

  const titles = outlineText
    .split("\n")
    .map((line) => line.replace(/^\d+[\).]\s*/, "").trim())
    .filter(Boolean);

  if (titles.length === 0) {
    return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
  }

  const { data: last } = await supabase
    .from("chapters")
    .select("position")
    .eq("book_id", bookId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  let position = (last?.position ?? 0) + 1;

  const inserts = titles.map((title) => ({
    book_id: bookId,
    org_id: user.id,
    title,
    slug: toSlug(title) || "chapter",
    position: position++,
    status: "outline",
    summary: null,
    markdown_current: "",
    word_count: 0,
  }));

  await supabase.from("chapters").insert(inserts);

  return NextResponse.redirect(new URL(`/books/${bookId}?tab=outline`, req.url));
}
