import path from "path";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

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
  const scopeType = String(form.get("scope_type") || "").trim();
  const scopeId = String(form.get("scope_id") || "").trim();
  const file = form.get("file");

  if (!scopeType || !scopeId || !file || !(file instanceof File)) {
    return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
  }

  const filename = file.name || "attachment";
  const ext = path.extname(filename).toLowerCase();
  const storagePath = `${user.id}/${scopeType}/${scopeId}/${Date.now()}-${toSlug(filename) || "attachment"}${ext}`;

  await supabase.storage.from("attachments").upload(storagePath, file, {
    cacheControl: "3600",
    upsert: true,
  });

  await supabase.from("attachments").insert({
    org_id: user.id,
    scope_type: scopeType,
    scope_id: scopeId,
    filename,
    storage_path: storagePath,
    mime_type: file.type,
    size_bytes: file.size,
  });

  return NextResponse.redirect(new URL(req.headers.get("referer") || "/", req.url));
}
