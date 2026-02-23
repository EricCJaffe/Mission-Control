import { supabaseServer } from "@/lib/supabase/server";
import DashboardHome from "@/components/DashboardHome";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (user) {
    return <DashboardHome />;
  }
  redirect("/login");
}
