import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, Smartphone } from 'lucide-react';
import { supabaseServer } from '@/lib/supabase/server';
import {
  summariseAppleHealth,
  describeAge,
  MAX_PAYLOAD_MB,
  STALE_AFTER_HOURS,
  type SyncLogRow,
} from '@/lib/fitness/apple-health-status';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Apple Health | Fitness settings' };

const CARD = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm';

/**
 * Apple Health status.
 *
 * There is deliberately no "sync now" button. HealthKit has no server API, so
 * nothing here can pull from Apple — the only thing that moves data is Health
 * Auto Export on the phone pushing it. A button that appeared to sync and
 * silently did nothing would be worse than no button, so this page tells you
 * what has arrived and what to do on the device instead.
 */
export default async function AppleHealthSettingsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data } = await supabase
    .from('apple_health_sync_logs')
    .select(
      'received_at, status, automation_name, workouts_written, body_metrics_written, daily_written, error_message, metrics_unmapped',
    )
    .eq('user_id', user.id)
    .order('received_at', { ascending: false })
    .limit(60);

  const status = summariseAppleHealth((data ?? []) as SyncLogRow[]);

  return (
    <main className="pt-4 md:pt-8">
      <Link
        href="/fitness/settings"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
      >
        <ArrowLeft className="h-4 w-4" /> Athlete settings
      </Link>

      <div className="mb-6">
        <h1 className="text-3xl font-semibold">Apple Health</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pushed from Health Auto Export on your iPhone. Apple Health cannot be pulled, so
          everything here depends on that app running.
        </p>
      </div>

      <div
        className={`${CARD} mb-4 ${
          status.stale ? 'border-amber-400 bg-amber-50' : status.everSynced ? 'border-emerald-300' : ''
        }`}
      >
        <div className="flex items-start gap-3">
          {status.stale ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          )}
          <div>
            {!status.everSynced ? (
              <p className="text-sm font-semibold text-slate-900">
                Nothing has ever arrived from Apple Health.
              </p>
            ) : status.stale ? (
              <>
                <p className="text-sm font-semibold text-amber-900">
                  Quiet for {describeAge(status.ageHours!)}.
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  Nothing is wrong on this end — every payload that has arrived was written
                  successfully. Silence means the phone stopped sending.
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-emerald-900">
                Healthy — last payload {describeAge(status.ageHours!)} ago.
              </p>
            )}
            {status.lastAt && (
              <p className="mt-1 text-xs text-slate-500">
                Last received {new Date(status.lastAt).toLocaleString()} · {status.payloads} payloads
                on record · flagged after {STALE_AFTER_HOURS}h
              </p>
            )}
          </div>
        </div>
      </div>

      {status.automations.length > 0 && (
        <div className={`${CARD} mb-4`}>
          <h2 className="mb-3 text-lg font-semibold">Automations</h2>
          <p className="mb-3 text-sm text-slate-500">
            One row per automation in Health Auto Export. One can stop while the others keep
            running, which an overall &ldquo;last sync&rdquo; time would hide.
          </p>
          <ul className="space-y-2">
            {status.automations.map((a) => (
              <li
                key={a.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2"
              >
                <span className="font-semibold text-slate-800">{a.name}</span>
                <span className={`text-sm ${a.stale ? 'font-semibold text-amber-700' : 'text-slate-500'}`}>
                  {describeAge(a.ageHours)} ago
                  <span className="ml-2 text-xs text-slate-400">
                    {a.lastStatus} · wrote {a.lastWrote}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status.stale && (
        <div className={`${CARD} mb-4 border-rose-300 bg-rose-50`}>
          <h2 className="mb-2 text-lg font-semibold text-rose-900">
            Check this first: the payload may be too big
          </h2>
          <p className="text-sm text-rose-800">
            Health Auto Export sends everything since its last <em>successful</em> delivery.
            After a long gap that payload grows past <strong>{MAX_PAYLOAD_MB} MB</strong>, and
            Vercel rejects it with a 413 <strong>before it reaches this app</strong> — so no
            entry appears above, no error is recorded, and the export still shows 100% on the
            phone because the export succeeded and only the upload failed.
          </p>
          <p className="mt-2 text-sm font-semibold text-rose-900">
            The permanent fix is one setting: turn on <strong>Batch Requests</strong> in the
            automation&rsquo;s Export Settings.
          </p>
          <p className="mt-1 text-sm text-rose-800">
            With it on, Health Auto Export splits an export across several smaller requests
            instead of one, so no single request can reach the cap however much has piled up.
            Summarising and coarser time grouping only shrink the payload — batching removes
            the ceiling. Every write on this end is keyed and idempotent, so overlapping or
            repeated batches update in place rather than duplicating.
          </p>
          <p className="mt-2 text-sm font-semibold text-rose-900">
            To clear a backlog that is already stuck, each failure has widened the window, so
            it cannot recover on its own:
          </p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-rose-800">
            <li>Turn on Batch Requests.</li>
            <li>Set the date range to about a week and run it. It appears above within seconds.</li>
            <li>Repeat until current, then set the range back to Since Last Sync.</li>
            <li>Check iOS Settings → General → Background App Refresh has Health Auto Export
              enabled, so runs no longer depend on opening the app.</li>
          </ol>
        </div>
      )}

      <div className={`${CARD} mb-4`}>
        <div className="mb-3 flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-indigo-600" />
          <h2 className="text-lg font-semibold">Starting a sync</h2>
        </div>
        <p className="text-sm text-slate-600">
          The trigger lives on the phone — there is nothing to press here.
        </p>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
          <li>Open <strong>Health Auto Export</strong> on your iPhone.</li>
          <li>
            Check each automation above is still <strong>enabled</strong>. iOS suspends background
            automations for apps it decides are unused, and that is the usual cause of a long
            silence with no errors.
          </li>
          <li>Run an export to send immediately, then reload this page.</li>
          <li>
            If a <em>small</em> export still does not arrive, re-paste the API token. A wrong
            token is rejected before anything is logged, so it looks identical to both the phone
            not sending and the payload being too large.
          </li>
        </ol>
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
          POST https://missioncontrol.bibleos.app/api/fitness/apple-health/ingest
        </p>
      </div>

      {status.problems.length > 0 && (
        <div className={`${CARD} mb-4`}>
          <h2 className="mb-3 text-lg font-semibold">Recent problems</h2>
          <ul className="space-y-2">
            {status.problems.map((p, i) => (
              <li key={i} className="rounded-xl bg-rose-50 px-3 py-2">
                <p className="text-xs font-semibold text-rose-800">
                  {new Date(p.receivedAt).toLocaleString()} · {p.status}
                </p>
                <p className="mt-0.5 break-words text-xs text-rose-700">{p.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status.unmapped.length > 0 && (
        <div className={CARD}>
          <h2 className="mb-2 text-lg font-semibold">Metrics not yet mapped</h2>
          <p className="mb-2 text-sm text-slate-500">
            The phone is sending these and nothing here stores them yet.
          </p>
          <p className="font-mono text-xs text-slate-600">{status.unmapped.join(', ')}</p>
        </div>
      )}
    </main>
  );
}
