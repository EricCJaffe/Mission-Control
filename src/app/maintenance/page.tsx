import Link from 'next/link'
import { Wrench, Package, ShoppingCart } from 'lucide-react'
import { loadList, loadNeeds } from '@/lib/supplies-load'
import { supabaseServer } from '@/lib/supabase/server'
import { today } from '@/lib/day'
import { CATEGORIES, CATEGORY_KEYS, STARTER, type Category } from '@/lib/maintenance/library'
import { ASSET_COLUMNS, loadPlans, worst, type AssetRow, type PlanRow } from '@/lib/maintenance/load'
import { dueLabel } from '@/lib/maintenance/status'
import { describeRRule } from '@/lib/tasks/recurrence'
import IssuesList, { AddIssueForm, ISSUE_COLUMNS, type IssueRow } from '@/components/maintenance/IssuesList'
import { PlansTable, AssetsTable, type PlanView, type AssetView } from '@/components/maintenance/MaintenanceTables'

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
 * Plain form posts for every change. The lists are the fleet table
 * (components/maintenance/MaintenanceTables), fed plain rows built here.
 */

/* One schedule as a plain table row: the table is a client component. */
function planView(p: PlanRow, asset: AssetRow | undefined): PlanView {
  const unit = asset?.meter_unit ?? null
  const byMeter = p.meterUsed !== null && p.meter_interval !== null && p.meterUsed >= p.meter_interval
  return {
    id: p.task_id,
    title: p.task.title,
    assetId: p.asset_id,
    assetName: asset?.name ?? 'Unknown',
    typeLabel: asset ? (CATEGORIES[asset.category]?.label ?? 'Other') : 'Other',
    group: asset ? (CATEGORIES[asset.category]?.group ?? 'Other') : 'Other',
    repeats: describeRRule(p.task.recurrence_rule) ?? 'Once',
    dueDate: p.task.due_date,
    days: p.days,
    dueText: byMeter ? 'due by meter' : dueLabel(p.days),
    meterText:
      p.meter_interval && p.meterUsed !== null
        ? `${Math.round(p.meterUsed).toLocaleString()} of ${p.meter_interval.toLocaleString()}${unit ? ` ${unit}` : ''} since last`
        : '',
    verdict: p.verdict,
    description: p.task.description,
    why: p.task.why,
  }
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
  const [{ supplies, list }, needRows] = await Promise.all([
    loadList(supabase, userData.user.id),
    loadNeeds(supabase, userData.user.id, plans.map((p) => p.task_id)),
  ])
  const supplyProps = { options: supplies.map((s) => ({ id: s.id, name: s.name, unit: s.unit, on_hand: s.on_hand })), needs: needRows }

  const byAsset = new Map<string, PlanRow[]>()
  for (const p of plans) byAsset.set(p.asset_id, [...(byAsset.get(p.asset_id) ?? []), p])

  const attention = plans.filter((p) => p.verdict !== 'green')
  const red = plans.filter((p) => p.verdict === 'red').length
  const yellow = attention.length - red
  const next30 = plans.filter((p) => p.days !== null && p.days >= 0 && p.days <= 30).length

  const assetById = new Map(assets.map((a) => [a.id, a]))
  const planViews = plans.map((p) => planView(p, assetById.get(p.asset_id)))
  const assetViews: AssetView[] = assets.map((a) => {
    const own = byAsset.get(a.id) ?? []
    const next = own[0]
    return {
      id: a.id,
      name: a.name,
      typeLabel: CATEGORIES[a.category]?.label ?? 'Other',
      group: CATEGORIES[a.category]?.group ?? 'Other',
      makeModel: [a.model_year, a.make, a.model].filter(Boolean).join(' '),
      location: a.location ?? '',
      next: next ? next.task.title.replace(`${a.name}: `, '') : null,
      nextDays: next?.days ?? null,
      nextDueText: next ? dueLabel(next.days) : '',
      verdict: own.length ? worst(own.map((p) => p.verdict)) : null,
      schedules: own.length,
      meterText: a.meter_reading !== null && a.meter_unit ? `${a.meter_reading.toLocaleString()} ${a.meter_unit}` : '',
      state: a.status === 'stored' ? 'Stored' : 'Active',
      financeLinked: Boolean(a.finance_asset_id),
    }
  })

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
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/maintenance/supplies" className="text-sm font-medium text-blue-700 hover:underline">
            Supplies →
          </Link>
          <Link href="/maintenance/calendar" className="text-sm font-medium text-blue-700 hover:underline">
            Maintenance calendar →
          </Link>
        </div>
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

      {/* The shopping list, where it will be seen: it is derived, so it is only as good as being looked at. */}
      <Link
        href="/maintenance/supplies"
        className="mt-3 flex items-center justify-between gap-3 rounded-2xl border-2 border-slate-300 bg-white px-4 py-3 shadow-sm hover:border-blue-300"
      >
        <span className="flex items-center gap-2 text-sm">
          <ShoppingCart className="h-4 w-4 text-blue-700" />
          {list.length ? (
            <span>
              <b>{list.length} to buy</b>
              <span className="text-slate-500"> · {[...new Set(list.map((l) => l.supply.store?.trim() || 'Anywhere'))].slice(0, 3).join(', ')}</span>
            </span>
          ) : (
            <span className="text-slate-600">{supplies.length ? `Supplies: nothing to buy (${supplies.length} on the shelf)` : 'Supplies: add what we keep on hand'}</span>
          )}
        </span>
        <span className="text-sm font-medium text-blue-700">Shopping list →</span>
      </Link>

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

      {plans.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">
            Schedules ({plans.length}){attention.length > 0 && ` · ${attention.length} need attention`}
          </h2>
          <div className="mt-3">
            <PlansTable plans={planViews} mode="overview" redirect="/maintenance" todayIso={todayIso} supplies={supplyProps} />
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
      {assets.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Inventory ({assets.length})</h2>
          <div className="mt-3">
            <AssetsTable assets={assetViews} />
          </div>
        </section>
      )}

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
