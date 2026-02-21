import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const { data: attachment } = await supabase
    .from("attachments")
    .select("filename,storage_path,mime_type")
    .eq("id", id)
    .single();

  if (!attachment) return new Response("Not found", { status: 404 });

  const { data, error } = await supabase.storage.from("attachments").download(attachment.storage_path);
  if (error || !data) return new Response("Not found", { status: 404 });

  const arrayBuffer = await data.arrayBuffer();
  return new Response(arrayBuffer, {
    headers: {
      "Content-Type": attachment.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${attachment.filename}"`,
    },
  });
}
