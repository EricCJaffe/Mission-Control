import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function safeFilename(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 64);
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: asset } = await supabase
    .from("sermon_assets")
    .select("id,asset_type,content_md")
    .eq("id", id)
    .eq("org_id", user.id)
    .single();

  if (!asset) return NextResponse.redirect(new URL("/books", req.url));

  const filename = `${safeFilename(asset.asset_type || "artifact")}.md`;
  return new NextResponse(asset.content_md || "", {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
