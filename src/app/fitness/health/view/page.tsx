import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HealthDocViewClient from '@/components/fitness/HealthDocViewClient';

export const dynamic = 'force-dynamic';

export default async function HealthDocViewPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  // Get current health.md
  const { data: currentDoc } = await supabase
    .from('health_documents')
    .select('*')
    .eq('user_id', userData.user.id)
    .eq('is_current', true)
    .single();

  // Get version history (recent 10)
  const { data: versionHistory } = await supabase
    .from('health_documents')
    .select('id, version, created_at')
    .eq('user_id', userData.user.id)
    .order('version', { ascending: false })
    .limit(10);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Health Profile (health.md)</h1>
        <p className="text-gray-600">
          Your living health document. This feeds all AI features with complete medical context.
        </p>
      </div>

      <HealthDocViewClient
        healthDoc={currentDoc}
        versionHistory={versionHistory || []}
      />
    </div>
  );
}
