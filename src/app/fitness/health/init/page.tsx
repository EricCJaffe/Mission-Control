import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HealthInitClient from '@/components/fitness/HealthInitClient';

export const dynamic = 'force-dynamic';

export default async function HealthInitPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  // Check if health.md already exists
  let { data: healthDoc } = await supabase
    .from('health_documents')
    .select('id, version, created_at')
    .eq('user_id', userData.user.id)
    .eq('is_current', true)
    .single();

  if (!healthDoc) {
    const { data: legacyDoc } = await supabase
      .from('health_documents')
      .select('id, version, created_at')
      .eq('user_id', userData.user.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    healthDoc = legacyDoc;
  }

  // Check if medications have been seeded
  const { count: medsCount } = await supabase
    .from('medications')
    .select('id', { count: 'exact' })
    .eq('user_id', userData.user.id);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Health Intelligence System Setup</h1>
        <p className="text-gray-600">
          One-time initialization of your health profile and medication regimen.
          This powers all AI features with your medical context.
        </p>
      </div>

      <HealthInitClient
        healthDocExists={!!healthDoc}
        medsCount={medsCount || 0}
        healthDoc={healthDoc ? {
          id: healthDoc.id,
          version: healthDoc.version,
          createdAt: healthDoc.created_at,
        } : null}
      />
    </div>
  );
}
