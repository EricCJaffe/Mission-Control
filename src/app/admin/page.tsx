import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { Brain, FileText, Flame, Pin, HeartPulse, BarChart3, Plug, Settings } from 'lucide-react';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin | Mission Control' };

/**
 * Configuration hub.
 *
 * These surfaces describe how the system should behave — the persona it
 * writes from, the standard operating procedures, the workout templates, the
 * health document that drives training and supplement decisions. They're
 * referenced occasionally and edited rarely, so they don't belong in the daily
 * Spirit/Soul/Body groups competing with things you actually open each morning.
 */
export default async function AdminPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const [{ data: persona }, { data: soul }, { count: sopCount }, { count: practiceCount }, { count: templateCount }, { data: healthDoc }, { count: pendingUpdates }] =
    await Promise.all([
      supabase.from('notes').select('updated_at').eq('user_id', user.id).eq('title', 'persona').maybeSingle(),
      supabase.from('notes').select('updated_at').eq('user_id', user.id).eq('title', 'soul').maybeSingle(),
      supabase.from('sop_checks').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_done', false),
      supabase.from('practices').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('active', true),
      supabase.from('workout_templates').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase
        .from('health_documents')
        .select('version,last_updated_at')
        .eq('user_id', user.id)
        .eq('is_current', true)
        .maybeSingle(),
      supabase
        .from('health_doc_pending_updates')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'pending'),
    ]);

  const cards = [
    {
      href: '/knowledge',
      icon: <Brain className="h-5 w-5 text-violet-600" />,
      title: 'Persona & Soul',
      body: 'Who you are and how the AI should write as you. Feeds every generated summary and coaching output.',
      meta: persona?.updated_at ? `Persona updated ${String(persona.updated_at).slice(0, 10)}` : 'Persona not written yet',
      meta2: soul?.updated_at ? `Soul updated ${String(soul.updated_at).slice(0, 10)}` : null,
    },
    {
      href: '/fitness/health/view',
      icon: <HeartPulse className="h-5 w-5 text-rose-600" />,
      title: 'health.md',
      body: 'Medical history, medications, supplements, training constraints and vital targets. Drives workout planning and supplement analysis.',
      meta: healthDoc ? `Version ${healthDoc.version} · ${String(healthDoc.last_updated_at).slice(0, 10)}` : 'Not initialised',
      meta2: pendingUpdates ? `${pendingUpdates} update${pendingUpdates === 1 ? '' : 's'} awaiting review` : null,
    },
    {
      href: '/fitness/settings',
      icon: <Plug className="h-5 w-5 text-emerald-600" />,
      title: 'Connections & sync',
      body: 'Withings, Apple Health and Garmin. Set up once, then they run themselves — this is not something to look at daily.',
      meta: null,
      meta2: null,
    },
    {
      href: '/spirit',
      icon: <Flame className="h-5 w-5 text-amber-600" />,
      title: 'Practices',
      body: 'Which practices you track and how often — Bible reading, prayer, church, giving. Configured here; the ones due each day appear on the dashboard.',
      meta: `${practiceCount ?? 0} active`,
      meta2: null,
    },
    {
      href: '/sops',
      icon: <Pin className="h-5 w-5 text-rose-600" />,
      title: 'SOPs',
      body: 'Standard operating procedures and their recurring checks.',
      meta: `${sopCount ?? 0} step${sopCount === 1 ? '' : 's'} outstanding`,
      meta2: null,
    },
    {
      href: '/templates',
      icon: <FileText className="h-5 w-5 text-sky-600" />,
      title: 'Templates',
      body: 'Reusable structures — workout templates the logger pre-fills from, plus the quarterly and annual review templates.',
      meta: `${templateCount ?? 0} workout template${templateCount === 1 ? '' : 's'}`,
      meta2: null,
    },
    {
      href: '/metrics',
      icon: <BarChart3 className="h-5 w-5 text-purple-600" />,
      title: 'Metrics (legacy)',
      body: 'The old standalone metrics page. Everything it showed now appears on the dashboard; kept reachable rather than deleted.',
      meta: 'Hidden from navigation',
      meta2: null,
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-1">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-semibold">
          <Settings className="h-7 w-7 text-slate-400" />
          Admin
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Configuration and reference. These define how the system behaves rather than
          being places you work day to day.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm transition-shadow hover:shadow"
          >
            <div className="flex items-center gap-2">
              {card.icon}
              <h2 className="text-base font-bold text-slate-900">{card.title}</h2>
            </div>
            <p className="mt-1.5 text-sm leading-snug text-slate-600">{card.body}</p>
            <p className="mt-2 text-xs font-medium text-slate-500">{card.meta}</p>
            {card.meta2 && <p className="text-xs font-medium text-amber-700">{card.meta2}</p>}
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border-2 border-slate-300 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold text-slate-900">How these relate</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          <strong>health.md</strong> is the clinical source of truth — training
          constraints, medications and vital targets are read from it when generating
          workouts, evaluating a new supplement, and preparing for a cardiology visit.{' '}
          <strong>Persona &amp; Soul</strong> govern voice and values in anything the AI
          writes. <strong>SOPs</strong> and <strong>Templates</strong> capture repeatable
          structure. Changing health.md changes what the system considers safe to
          prescribe, so it goes through a review queue rather than direct edits.
        </p>
      </div>
    </div>
  );
}
