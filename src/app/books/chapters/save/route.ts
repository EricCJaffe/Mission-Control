import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { chunkMarkdown, upsertChapterChunks } from "@/lib/ai/chunking";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseServer();
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    let body: any = null;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await req.json().catch(() => null);
    } else {
      const form = await req.formData().catch(() => null);
      if (form) {
        body = Object.fromEntries(form.entries());
      }
    }

    if (!body?.chapter_id) return NextResponse.json({ error: "missing" }, { status: 400 });

    const chapterId = String(body.chapter_id);
    const markdown = String(body.markdown ?? "");
    const title = String(body.title ?? "");
    const status = String(body.status ?? "outline");
    const summary = body.summary ? String(body.summary) : null;

    const { data: currentChapter } = await supabase
      .from("chapters")
      .select("markdown_current,title,summary,status")
      .eq("id", chapterId)
      .single();

    const unchanged =
      currentChapter &&
      currentChapter.markdown_current === markdown &&
      currentChapter.title === title &&
      (currentChapter.summary || "") === (summary || "") &&
      (currentChapter.status || "") === (status || "");

    if (unchanged) {
      return NextResponse.json({ ok: true, version: null, unchanged: true });
    }

    const { data: latestVersion } = await supabase
      .from("chapter_versions")
      .select("version_number")
    .eq("chapter_id", chapterId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

    const nextVersion = (latestVersion?.version_number ?? 0) + 1;

    const { error: updateError } = await supabase
    .from("chapters")
    .update({
      title,
      status,
      summary,
      markdown_current: markdown,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chapterId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const { error: versionError } = await supabase.from("chapter_versions").insert({
    chapter_id: chapterId,
    org_id: user.id,
    version_number: nextVersion,
    markdown,
    created_by: user.id,
    });

    if (versionError) {
      return NextResponse.json({ error: versionError.message }, { status: 400 });
    }

    const chunks = chunkMarkdown(markdown);
    await upsertChapterChunks(supabase, chapterId, user.id, chunks);

    return NextResponse.json({ ok: true, version: nextVersion });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "save_failed" }, { status: 500 });
  }
}
