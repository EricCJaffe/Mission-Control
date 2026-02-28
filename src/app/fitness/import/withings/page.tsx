import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import WithingsImportWizard from '@/components/fitness/WithingsImportWizard';

export const dynamic = 'force-dynamic';

export default async function WithingsImportPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  return <WithingsImportWizard />;
}
