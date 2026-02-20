import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();

  const url = new URL(req.url);
  return NextResponse.redirect(new URL("/login", url.origin), {
    status: 303,
  });
}
