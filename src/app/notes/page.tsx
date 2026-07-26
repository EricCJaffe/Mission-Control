import { supabaseServer } from "@/lib/supabase/server";
import KnowledgeBaseClient from "@/components/KnowledgeBaseClient";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Knowledge Base</h1>
        <p className="mt-1 text-sm text-slate-500">
          Searchable notes by category. Markdown-first, so it stays portable.
        </p>
      </div>
      <KnowledgeBaseClient />
    </main>
  );
}
