import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = await req.formData();
  const id = String(form.get("id") || "");
  if (!id) return NextResponse.redirect(new URL("/books", req.url));

  await supabase.from("books").delete().eq("id", id);
  return NextResponse.redirect(new URL("/books", req.url));
}
