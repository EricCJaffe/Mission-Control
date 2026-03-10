import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/**
 * GET /api/fitness/health/download
 * Returns the current health.md as a downloadable markdown file.
 */
export async function GET() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: doc, error } = await supabase
    .from('health_documents')
    .select('content, version, updated_at')
    .eq('user_id', user.id)
    .eq('is_current', true)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: 'No health document found' }, { status: 404 });
  }

  const filename = `health-v${doc.version}.md`;

  return new NextResponse(doc.content, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
