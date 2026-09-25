import Link from 'next/link'
import { Wrench, CheckCircle2, Package } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { today } from '@/lib/day'
import { CATEGORIES, CATEGORY_KEYS, STARTER, type Category } from '@/lib/maintenance/library'
import { ASSET_COLUMNS, loadPlans, worst, VERDICT_CLASS, VERDICT_DOT, type AssetRow, type PlanRow } from '@/lib/maintenance/load'
import { dueLabel } from '@/lib/maintenance/status'
import { describeRRule } from '@/lib/tasks/recurrence'
import IssuesList, { AddIssueForm, ISSUE_COLUMNS, type IssueRow } from '@/components/maintenance/IssuesList'

export const dynamic = 'force-dynamic'

/*
 * Routine maintenance: what we own, and what it needs next.
 *
 * Every schedule here is an ordinary recurring task in the "Home & Equipment
 * Maintenance" project, so it also appears in /tasks, the weekly brief and the
 * calendar. This page is the view that groups them by the machine they are
 * for, which is how maintenance is actually thought about ("what does the
 * tractor need?"), and adds the two things a task list cannot: an hours/miles
 * clock and a service history.
 *
 * Plain form posts, no client state, matching /ideas and /projects.
 */

const GROUPS = ['Engines & equipment', 'Vehicles & water', 'Home systems', 'Appliances', 'Other'] as const

function DoneForm({ plan }: { plan: PlanRow }) {
  return (
    <form action={`/maintenance/tasks/${plan.task_id}/complete`} method="post">
      <input type="hidden" name="redirect" value="/maintenance" />
      <button
        type="submit"
        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-green-300 hover:text-green-700"
        title="Mark done — it rolls forward to the next date and is logged in the history"
      >
        <CheckCircle2 className="h-3.5 w-3.5" /> Done
      </button>
    </form>
  )
}

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>
}) {
  const sp = searchParams ? await searchParams : undefined
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const todayIso = today()
  const { data, error } = await supabase
    .from('maintenance_assets')
    .select(ASSET_COLUMNS)
    .neq('status', 'retired')
    .order('name')
  const assets = (data ?? []) as AssetRow[]
  const plans = await loadPlans(supabase, assets, todayIso)
  const { data: issueData } = await supabase
    .from('maintenance_issues')
    .select(ISSUE_COLUMNS)
    .neq('status', 'resolved')
    .order('opened_on')
  const issues = (issueData ?? []) as IssueRow[]
  const assetNames = Object.fromEntries(assets.map((a) => [a.id, a.name]))

  const byAsset = new Map<string, PlanRow[]>()
  for (const p of plans) byAsset.set(p.asset_id, [...(byAsset.get(p.asset_id) ?? []), p])

  const attention = plans.filter((p) => p.verdict !== 'green')
  const red = plans.filter((p) => p.verdict === 'red').length
  const yellow = attention.length - red
  const next30 = plans.filter((p) => p.days !== null && p.days >= 0 && p.days <= 30).length

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold">
            <Wrench className="h-7 w-7 text-orange-600" />
            Maintenance
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Everything we own that needs looking after, and what each needs next. Each schedule is a
            recurring task — it also shows in Tasks, the weekly brief and the calendar.
          </p>
        </div>
        <Link href="/calendar" className="text-sm font-medium text-blue-700 hover:underline">
          See it on the calendar →
        </Link>
      </div>

      {sp?.error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sp.error}</div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Error loading inventory: {error.message}
        </div>
      )}

      {/* The numbers first: is anything waiting on me? */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Overdue', value: red, cls: red ? 'text-red-700' : 'text-slate-900' },
          { label: 'Due in 2 weeks', value: yellow, cls: yellow ? 'text-yellow-700' : 'text-slate-900' },
          { label: 'Next 30 days', value: next30, cls: 'text-slate-900' },
          { label: 'Open issues', value: issues.length, cls: issues.length ? 'text-red-700' : 'text-slate-900' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm">
            <div className="text-xs uppercase tracking-[0.15em] text-slate-500">{s.label}</div>
            <div className={`mt-1 text-2xl font-semibold ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {assets.length === 0 && !error && (
        <div className="mt-6 rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Start with what we have</h2>
          <p className="mt-1 text-sm text-slate-600">
            Adds one of each — {STARTER.map((s) => s.name.toLowerCase()).join(', ')} — with a
            best-practice schedule for each. Rename them and add exact models afterwards.
          </p>
          <form action="/maintenance/starter" method="post" className="mt-3">
            <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
              Load starter inventory ({STARTER.length} items)
            </button>
          </form>
        </div>
      )}

      {attention.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Needs attention ({attention.length})</h2>
          <div className="mt-3 grid gap-2">
            {attention.map((p) => (
              <div
                key={p.task_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${VERDICT_DOT[p.verdict]}`} />
                  <div className="min-w-0">
                    <Link href={`/maintenance/${p.asset_id}`} className="font-medium hover:underline">
                      {p.task.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {describeRRule(p.task.recurrence_rule)}
                      {p.meter_interval && p.meterUsed !== null && (
                        <> · {Math.round(p.meterUsed)} of {p.meter_interval} since last</>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[p.verdict]}`}>
                    {p.meterUsed !== null && p.meter_interval && p.meterUsed >= p.meter_interval
                      ? 'due by meter'
                      : dueLabel(p.days)}
                  </span>
                  <DoneForm plan={p} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Faults and loose ends: not a schedule, but they block one. */}
      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Open issues ({issues.length})</h2>
        <div className="mt-3">
          <IssuesList issues={issues} redirect="/maintenance" assetNames={assetNames} />
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-blue-700">Log an issue…</summary>
            <AddIssueForm redirect="/maintenance" assets={assets.map((a) => ({ id: a.id, name: a.name }))} />
          </details>
        </div>
      </section>

      {/* The inventory, grouped the way it is thought about. */}
      {GROUPS.map((group) => {
        const inGroup = assets.filter((a) => CATEGORIES[a.category]?.group === group)
        if (inGroup.length === 0) return null
        return (
          <section key={group} className="mt-8">
            <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">{group}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inGroup.map((a) => {
                const own = byAsset.get(a.id) ?? []
                const v = worst(own.map((p) => p.verdict))
                const next = own[0]
                return (
                  <Link
                    key={a.id}
                    href={`/maintenance/${a.id}`}
                    className="block rounded-2xl border-2 border-slate-300 bg-white p-4 shadow-sm transition hover:border-blue-300"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{a.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {[a.model_year, a.make, a.model].filter(Boolean).join(' ') || (
                            <span className="text-yellow-700">Add make and model</span>
                          )}
                        </div>
                      </div>
                      <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${own.length ? VERDICT_DOT[v] : 'bg-slate-300'}`} />
                    </div>
                    <div className="mt-3 text-xs text-slate-600">
                      {next ? (
                        <>
                          Next: {next.task.title.replace(`${a.name}: `, '')}{' '}
                          <span className="text-slate-400">({dueLabel(next.days)})</span>
                        </>
                      ) : (
                        'Nothing scheduled'
                      )}
                    </div>
                    <div className="mt-1 flex gap-3 text-[11px] text-slate-400">
                      <span>{own.length} schedule{own.length === 1 ? '' : 's'}</span>
                      {a.meter_reading !== null && a.meter_unit && (
                        <span>
                          {a.meter_reading.toLocaleString()} {a.meter_unit}
                        </span>
                      )}
                      {a.status === 'stored' && <span>stored</span>}
                      {a.finance_asset_id && <span>linked to FinanceOS</span>}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}

      <section className="mt-10">
        <details className="rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm" open={assets.length === 0}>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold">
            <Package className="h-4 w-4 text-blue-600" /> Add an item
          </summary>
          <form action="/maintenance/assets/new" method="post" className="mt-4 grid gap-3 sm:grid-cols-2">
            <input name="name" required placeholder="Name — e.g. Kubota tractor" className="rounded-xl border border-slate-200 px-3 py-2" />
            <select name="category" required defaultValue="" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="" disabled>Type…</option>
              {CATEGORY_KEYS.map((k: Category) => (
                <option key={k} value={k}>
                  {CATEGORIES[k].label}
                </option>
              ))}
            </select>
            <input name="make" placeholder="Make — e.g. Kubota" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input name="model" placeholder="Model — e.g. L2501" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input name="model_year" type="number" placeholder="Year" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input name="location" placeholder="Where it lives — barn, garage, dock" className="rounded-xl border border-slate-200 px-3 py-2" />
            <input name="meter_reading" type="number" step="any" placeholder="Hours or miles now (if it has a meter)" className="rounded-xl border border-slate-200 px-3 py-2" />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="seed" defaultChecked className="h-4 w-4 rounded border-slate-300" />
              Schedule the best-practice defaults
            </label>
            <div className="sm:col-span-2">
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white shadow-sm" type="submit">
                Add item
              </button>
            </div>
          </form>
        </details>
      </section>
    </main>
  )
}
