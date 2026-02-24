import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { callOpenAI } from "@/lib/openai";

const ASSET_TYPES = [
  "Small Group Leader Guide",
  "Small Group Participant Guide",
  "Daily Devotional Pack",
  "Social Media Pack",
];

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const seriesId = String(form.get("series_id") || "").trim();
  if (!seriesId) return NextResponse.redirect(new URL("/sermons", req.url));

  const { data: series } = await supabase
    .from("sermon_series")
    .select("id,title,subtitle,theme,description")
    .eq("id", seriesId)
    .single();

  const { data: sermons } = await supabase
    .from("sermons")
    .select("id,title,key_text,big_idea,outline_md,manuscript_md,position")
    .eq("series_id", seriesId)
    .order("position", { ascending: true });

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

  for (const assetType of ASSET_TYPES) {
    const output = await callOpenAI({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      system: `You are a sermon resource generator aligned to persona and soul. Produce ${assetType} in markdown.`,
      user: `Series: ${JSON.stringify(series)}\nSermons: ${JSON.stringify(sermons)}\nPersona:\n${persona}\nSoul:\n${soul}`,
    });

    await supabase.from("sermon_assets").insert({
      org_id: user.id,
      scope_type: "series",
      scope_id: seriesId,
      asset_type: assetType,
      content_md: output,
      status: "draft",
    });
  }

  return NextResponse.redirect(new URL(`/sermons/${seriesId}?tab=assets`, req.url));
}
