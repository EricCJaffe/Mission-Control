import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import SermonSeriesClient from "@/components/SermonSeriesClient";

export const dynamic = "force-dynamic";

function wordCount(markdown?: string | null) {
  if (!markdown) return 0;
  return markdown.trim().split(/\s+/).filter(Boolean).length;
}

export default async function SermonSeriesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const tab = resolvedSearch?.tab || "outline";

  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: series } = await supabase
    .from("sermon_series")
    .select("id,title,subtitle,description,status,theme,start_date,end_date")
    .eq("id", id)
    .single();

  if (!series) {
    return (
      <main className="pt-4 md:pt-8">
        <h1 className="text-3xl font-semibold">Series not found</h1>
      </main>
    );
  }

  const { data: sermons } = await supabase
    .from("sermons")
    .select("id,title,status,position,outline_md,manuscript_md,preach_date,key_text,big_idea")
    .eq("series_id", id)
    .order("position", { ascending: true });

  const { data: assets } = await supabase
    .from("sermon_assets")
    .select("id,asset_type,status,scope_type,scope_id,content_md,created_at")
    .eq("scope_type", "series")
    .eq("scope_id", id)
    .order("created_at", { ascending: false });

  return (
    <main className="pt-4 md:pt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{series.title}</h1>
          {series.subtitle && <p className="mt-1 text-sm text-slate-600">{series.subtitle}</p>}
          <p className="mt-1 text-xs text-slate-500">
            Status: {series.status} · {series.start_date || "n/a"} → {series.end_date || "n/a"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs" href="/sermons">
            Back to series
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <Link className={`rounded-full border px-3 py-1 ${tab === "outline" ? "bg-blue-700 text-white" : "bg-white"}`} href={`/sermons/${series.id}?tab=outline`}>
          Outline
        </Link>
        <Link className={`rounded-full border px-3 py-1 ${tab === "assets" ? "bg-blue-700 text-white" : "bg-white"}`} href={`/sermons/${series.id}?tab=assets`}>
          Assets
        </Link>
        <Link className={`rounded-full border px-3 py-1 ${tab === "ai" ? "bg-blue-700 text-white" : "bg-white"}`} href={`/sermons/${series.id}?tab=ai`}>
          AI Tools
        </Link>
      </div>

      <SermonSeriesClient
        series={series}
        sermons={(sermons || []).map((sermon) => ({
          ...sermon,
          word_count: wordCount(sermon.manuscript_md || sermon.outline_md || ""),
        }))}
        assets={assets || []}
        tab={tab}
      />
    </main>
  );
}
