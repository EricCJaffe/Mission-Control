import { supabaseServer } from "@/lib/supabase/server";
import CalendarClient from "@/components/CalendarClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>;
}) {
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const selectedDate = resolvedSearch?.date || new Date().toISOString().slice(0, 10);
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: events, error } = await supabase
    .from("calendar_events")
    .select("id,title,start_at,end_at,event_type,domain,notes,recurrence_rule,recurrence_until,alignment_tag")
    .order("start_at", { ascending: true })
    .limit(200);

  const { data: goals } = await supabase.from("goals").select("id,title").order("created_at", { ascending: false }).limit(50);
  const { data: tasks } = await supabase.from("tasks").select("id,title").order("created_at", { ascending: false }).limit(50);
  const { data: notes } = await supabase.from("notes").select("id,title").order("created_at", { ascending: false }).limit(50);
  const { data: reviews } = await supabase.from("monthly_reviews").select("id,period_start").order("period_start", { ascending: false }).limit(12);

  return (
    <main className="pt-4 md:pt-8">
      <div>
        <h1 className="text-3xl font-semibold">Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">Supabase-only calendar events.</p>
      </div>

      <CalendarClient
        events={(events || []) as any}
        initialDate={selectedDate}
        goals={(goals || []) as any}
        tasks={(tasks || []) as any}
        notes={(notes || []) as any}
        reviews={(reviews || []) as any}
      />

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading events: {error.message}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading events: {error.message}
        </div>
      )}
    </main>
  );
}
