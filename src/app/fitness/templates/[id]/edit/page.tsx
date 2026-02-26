import { supabaseServer } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import TemplateBuilderClient from '@/components/fitness/TemplateBuilderClient';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TemplateEditPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    redirect('/login');
  }

  // Load template
  const { data: template, error: templateError } = await supabase
    .from('workout_templates')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (templateError || !template) {
    redirect('/fitness/templates');
  }

  // Load all exercises (global + user's)
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name, category, equipment, muscle_groups, is_compound, is_template')
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order('name', { ascending: true });

  return (
    <main className="pt-4 md:pt-8 pb-24">
      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Edit Template Structure</h1>
        <p className="mt-1 text-sm text-slate-500">
          {template.name} — Add exercises, create supersets, configure sets
        </p>
      </div>
      <TemplateBuilderClient
        template={template}
        exercises={exercises ?? []}
      />
    </main>
  );
}
