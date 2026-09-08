import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";
import { renderMarkdown } from "@/lib/markdown";

export const dynamic = "force-dynamic";

/*
 * One brief, as the job wrote it.
 *
 * Rendered in a sandboxed iframe with `srcDoc`, exactly as `/briefs/[id]` does,
 * and for a stronger reason than layout. That page's iframe is about an email's
 * 640px table layout not fighting the app's styles; here the content was
 * written by an agent that had just read an untrusted mailbox, so it is the
 * least trusted markup in the application. `sandbox=""` denies scripts, forms
 * and same-origin access.
 *
 * Markdown briefs go through the app's own renderer first, which escapes all
 * HTML before applying any markup and allows only http, https and mailto in
 * links — so a brief cannot smuggle markup in through the markdown path either.
 */

/*
 * Both formats are wrapped, and the HTML one is wrapped too.
 *
 * The Friday brief is an email fragment: it opens with `<p>` and carries no
 * document, head or charset. Dropped into a bare srcDoc it renders in the
 * iframe's default serif at whatever encoding the browser guesses, which
 * mangles the em-dashes these briefs are full of.
 */
function documentFor(body: string, format: string): string {
  const inner = format === "html" ? body : renderMarkdown(body);
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font: 14px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         color: #1e293b; margin: 20px; max-width: 760px; }
  h1, h2, h3 { line-height: 1.25; }
  table { border-collapse: collapse; }
  td, th { padding: 6px 10px; vertical-align: top; }
  code { background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
  a { color: #1d4ed8; }
</style></head><body>${inner}</body></html>`;
}

export default async function BrainBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data: output } = await supabase
    .from("brain_outputs")
    .select("id,path,job_name,produced_on,body,format,bytes,committed_at")
    .eq("id", id)
    .maybeSingle();

  if (!output) {
    return (
      <main className="pt-4 md:pt-8">
        <h1 className="text-3xl font-semibold">Brief not found</h1>
        <Link className="mt-3 inline-block text-sm text-blue-700 hover:underline" href="/brain/briefs">
          Back to briefs
        </Link>
      </main>
    );
  }

  return (
    <main className="pt-4 md:pt-8">
      <Link
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
        href="/brain/briefs"
      >
        <ArrowLeft className="h-4 w-4" />
        All briefs
      </Link>

      <div className="mt-3 mb-4">
        <h1 className="text-3xl font-semibold">
          {output.job_name} — {output.produced_on}
        </h1>
        <p className="mt-1 font-mono text-xs text-slate-500">
          {output.path}
          {output.committed_at &&
            ` · committed ${new Date(output.committed_at).toLocaleString()}`}
        </p>
      </div>

      {output.bytes === 0 ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 shadow-sm">
          <p className="text-sm text-amber-900">
            This file is empty. The job ran and wrote nothing — which is not the same as the job not
            running, and is why the size is shown rather than assumed.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border-2 border-slate-300 bg-white shadow-sm">
          <iframe
            title={`${output.job_name} brief`}
            className="h-[80vh] w-full"
            sandbox=""
            srcDoc={documentFor(output.body ?? "", output.format)}
          />
        </div>
      )}
    </main>
  );
}
