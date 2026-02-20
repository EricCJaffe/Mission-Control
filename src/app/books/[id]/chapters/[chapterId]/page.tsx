import { supabaseServer } from "@/lib/supabase/server";
import ChapterEditor from "@/components/ChapterEditor";

export const dynamic = "force-dynamic";

export default async function ChapterEditorPage({ params }: { params: { id: string; chapterId: string } }) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data: chapter } = await supabase
    .from("chapters")
    .select("id,book_id,title,status,summary,markdown_current")
    .eq("id", params.chapterId)
    .single();

  if (!chapter) {
    return (
      <main className="pt-8">
        <h1 className="text-3xl font-semibold">Chapter not found</h1>
      </main>
    );
  }

  const { data: versions } = await supabase
    .from("chapter_versions")
    .select("id,version_number,created_at")
    .eq("chapter_id", chapter.id)
    .order("version_number", { ascending: false })
    .limit(30);

  const { data: notes } = await supabase
    .from("research_notes")
    .select("id,title,content_md,tags")
    .eq("scope_type", "chapter")
    .eq("scope_id", chapter.id)
    .order("created_at", { ascending: false });

  const { data: thread } = await supabase
    .from("chat_threads")
    .select("id")
    .eq("scope_type", "chapter")
    .eq("scope_id", chapter.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: messages } = thread?.id
    ? await supabase
        .from("chat_messages")
        .select("id,role,content,created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  return (
    <ChapterEditor
      chapter={chapter}
      versions={versions || []}
      researchNotes={notes || []}
      chatMessages={messages || []}
    />
  );
}
