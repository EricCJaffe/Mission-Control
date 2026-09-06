import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/*
 * One brief, as it was sent.
 *
 * Rendered in an iframe with `srcDoc` rather than dangerouslySetInnerHTML.
 * The brief is an email: a 640px table layout with inline styles built for
 * Outlook, and dropping that into the page would let its styles fight the
 * app's and its width break the layout. The iframe also sandboxes content that
 * quotes email subjects and senders — text this app did not write.
 */
export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: brief } = await supabase
    .from("briefs")
    .select("id,kind,period_start,period_end,html,generated_at,sent_at,sent_to,send_error")
    .eq("id", id)
    .maybeSingle();

  if (!brief) {
    return (
      <main className="pt-4 md:pt-8">
        <h1 className="text-3xl font-semibold">Brief not found</h1>
        <Link className="mt-3 inline-block text-sm text-blue-700 hover:underline" href="/briefs">
          Back to briefs
        </Link>
      </main>
    );
  }

  return (
    <main className="pt-4 md:pt-8">
      <Link
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        href="/briefs"
      >
        <ArrowLeft className="h-4 w-4" />
        All briefs
      </Link>

      <div className="mt-3 mb-4">
        <h1 className="text-3xl font-semibold">
          {brief.kind === "weekly" ? "Weekly" : "Daily"} brief — {brief.period_start}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Generated {new Date(brief.generated_at).toLocaleString()}
          {brief.sent_at
            ? ` · sent to ${brief.sent_to}`
            : brief.send_error
              ? " · not sent"
              : " · not sent"}
        </p>
        {brief.send_error && (
          <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {brief.send_error}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
        <iframe
          title="Brief"
          className="h-[80vh] w-full"
          sandbox=""
          srcDoc={brief.html ?? "<p>This brief has no stored body.</p>"}
        />
      </div>
    </main>
  );
}
