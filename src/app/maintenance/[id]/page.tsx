import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Wrench, Sparkles, History, Trash2, Plus, Landmark } from 'lucide-react'
import { supabaseServer } from '@/lib/supabase/server'
import { today } from '@/lib/day'
import { CATEGORIES, CATEGORY_KEYS, itemsFor } from '@/lib/maintenance/library'
import { ASSET_COLUMNS, loadPlans, VERDICT_CLASS, type AssetRow } from '@/lib/maintenance/load'
import { dueLabel } from '@/lib/maintenance/status'
import type { Research } from '@/lib/maintenance/research'
import { describeRRule } from '@/lib/tasks/recurrence'
import RecurrencePicker from '@/components/tasks/RecurrencePicker'
import IssuesList, { AddIssueForm, ISSUE_COLUMNS, type IssueRow } from '@/components/maintenance/IssuesList'

export const dynamic = 'force-dynamic'

type FinanceAsset = {
  id: string
  name: string
  asset_type: string | null
  estimated_value: number | null
  purchase_price: number | null
  purchase_date: string | null
  vin: string | null
  mileage: number | null
}

type LogRow = {
  id: string
  title: string
  performed_on: string
  meter_reading: number | null
  cost: number | null
  vendor: string | null
  notes: string | null
  source: string
}

const input = 'rounded-xl border border-slate-200 px-3 py-2 text-sm'
const card = 'rounded-2xl border-2 border-slate-300 bg-white p-5 shadow-sm'
const money = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default async function MaintenanceAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ error?: string }>
}) {
  const { id } = await params
  const sp = searchParams ? await searchParams : undefined
  const supabase = await supabaseServer()
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return null

  const { data: assetData } = await supabase.from('maintenance_assets').select(ASSET_COLUMNS).eq('id', id).maybeSingle()
  if (!assetData) notFound()
  const asset = assetData as AssetRow
  const here = `/maintenance/${id}`
  const todayIso = today()

  /*
   * FinanceOS's inventory is `public.assets`, in the same database. Read with
   * .schema('public') — the client is bound to `mission` by default (see
   * src/lib/supabase/schema.ts) — and read only: this app never writes there.
   */
  const [plans, { data: logData }, { data: financeData }, { data: issueData }] = await Promise.all([
    loadPlans(supabase, [asset], todayIso),
    supabase
      .from('maintenance_log')
      .select('id,title,performed_on,meter_reading,cost,vendor,notes,source')
      .eq('asset_id', id)
      .order('performed_on', { ascending: false })
      .limit(100),
    supabase
      .schema('public')
      .from('assets')
      .select('id,name,asset_type,estimated_value,purchase_price,purchase_date,vin,mileage')
      .order('name'),
    supabase.from('maintenance_issues').select(ISSUE_COLUMNS).eq('asset_id', id).neq('status', 'resolved').order('opened_on'),
  ])
  const issues = (issueData ?? []) as IssueRow[]
  const log = (logData ?? []) as LogRow[]
  const financeAssets = (financeData ?? []) as FinanceAsset[]
  const linked = financeAssets.find((f) => f.id === asset.finance_asset_id) ?? null

  const scheduledKeys = new Set(plans.map((p) => p.library_key).filter(Boolean))
  const suggestions = itemsFor(asset.category).filter((i) => !scheduledKeys.has(i.key))
  const research = asset.research as Research | null
  const totalCost = log.reduce((s, l) => s + (l.cost ?? 0), 0)
  const unit = asset.meter_unit

  return (
    <main className="pt-4 md:pt-8 pb-16">
      <Link href="/maintenance" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Maintenance
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-semibold">
            <Wrench className="h-7 w-7 text-orange-600" />
            {asset.name}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {CATEGORIES[asset.category]?.label}
            {[asset.model_year, asset.make, asset.model].some(Boolean) &&
              ` · ${[asset.model_year, asset.make, asset.model].filter(Boolean).join(' ')}`}
            {asset.location && ` · ${asset.location}`}
            {asset.status !== 'active' && ` · ${asset.status}`}
          </p>
        </div>
        {unit && (
          <form action={`${here}/update`} method="post" className="flex items-center gap-2">
            <input
              name="meter_reading"
              type="number"
              step="any"
              defaultValue={asset.meter_reading ?? ''}
              className={`${input} w-32`}
              aria-label={`Current ${unit}`}
            />
            <span className="text-sm text-slate-500">{unit}</span>
            <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white" type="submit">
              Update
            </button>
          </form>
        )}
      </div>

      {sp?.error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{sp.error}</div>
      )}

      {/* ---------------------------------------------------------------- */}
      <section className="mt-6">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Schedule ({plans.length})</h2>
        <div className="mt-3 grid gap-3">
          {plans.length === 0 && <p className="text-sm text-slate-500">Nothing scheduled yet — add from the list below.</p>}
          {plans.map((p) => (
            <div key={p.task_id} className={card}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">{p.task.title.replace(`${asset.name}: `, '')}</div>
                  <div className="text-xs text-slate-500">
                    {describeRRule(p.task.recurrence_rule)}
                    {p.meter_interval && unit && ` · or every ${p.meter_interval.toLocaleString()} ${unit}`}
                    {p.task.due_date && ` · next ${p.task.due_date}`}
                    {p.meter_interval && p.meterUsed !== null && ` · ${Math.round(p.meterUsed).toLocaleString()} of ${p.meter_interval.toLocaleString()} used`}
                  </div>
                </div>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${VERDICT_CLASS[p.verdict]}`}>
                  {p.meterUsed !== null && p.meter_interval && p.meterUsed >= p.meter_interval ? 'due by meter' : dueLabel(p.days)}
                </span>
              </div>
              {p.task.description && <p className="mt-2 text-sm text-slate-700">{p.task.description}</p>}
              {p.task.why && <p className="mt-1 text-xs italic text-slate-500">Why: {p.task.why}</p>}

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium text-blue-700">Mark done…</summary>
                <form action={`/maintenance/tasks/${p.task_id}/complete`} method="post" className="mt-2 grid gap-2 sm:grid-cols-4">
                  <input type="hidden" name="redirect" value={here} />
                  <input name="performed_on" type="date" defaultValue={todayIso} className={input} aria-label="Date done" />
                  {unit && <input name="meter_reading" type="number" step="any" placeholder={`${unit} now`} className={input} />}
                  <input name="cost" type="number" step="0.01" placeholder="Cost $" className={input} />
                  <input name="vendor" placeholder="Who did it" className={input} />
                  <input name="notes" placeholder="Notes — parts used, what you found" className={`${input} sm:col-span-3`} />
                  <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white" type="submit">
                    Done — roll forward
                  </button>
                </form>
                <form action={`/maintenance/tasks/${p.task_id}/delete`} method="post" className="mt-2">
                  <input type="hidden" name="redirect" value={here} />
                  <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600" type="submit">
                    <Trash2 className="h-3 w-3" /> Stop this schedule
                  </button>
                </form>
              </details>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Open issues ({issues.length})</h2>
        <div className="mt-3">
          <IssuesList issues={issues} redirect={here} />
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-blue-700">Log an issue…</summary>
            <AddIssueForm redirect={here} assetId={id} />
          </details>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {suggestions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs uppercase tracking-[0.2em] text-slate-500">Best-practice items not yet scheduled</h2>
          <div className="mt-3 grid gap-2">
            {suggestions.map((s) => (
              <div key={s.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-slate-500">
                    {describeRRule(s.rule)}
                    {s.meterInterval && unit && ` · or every ${s.meterInterval} ${unit}`} — {s.why}
                  </div>
                </div>
                <form action={`${here}/schedule`} method="post">
                  <input type="hidden" name="library_key" value={s.key} />
                  <button className="flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1 text-xs font-medium text-white" type="submit">
                    <Plus className="h-3.5 w-3.5" /> Add
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      <section id="research" className="mt-8">
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-violet-600" /> Model-specific best practice
            </h2>
            <form action={`${here}/research`} method="post">
              <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white" type="submit">
                {research ? 'Research again' : 'Research this model'}
              </button>
            </form>
          </div>
          {!asset.make && !asset.model && (
            <p className="mt-2 text-sm text-yellow-800">Add the make and model below, then research — the generic list above is all there is until then.</p>
          )}
          {research && (
            <div className="mt-3 grid gap-3 text-sm">
              <p className="text-slate-700">{research.summary}</p>
              {research.caveat && <p className="text-xs text-yellow-800">{research.caveat}</p>}
              {research.parts.length > 0 && (
                <div className="grid gap-1 sm:grid-cols-2">
                  {research.parts.map((p, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-medium">{p.part}:</span> {p.spec}
                    </div>
                  ))}
                </div>
              )}
              {research.items.map((item, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-slate-500">
                      {describeRRule(item.rule)}
                      {item.meter_interval && unit && ` · or every ${item.meter_interval} ${unit}`}
                      {item.why && ` — ${item.why}`}
                    </div>
                  </div>
                  <form action={`${here}/schedule`} method="post">
                    <input type="hidden" name="research_index" value={i} />
                    <button className="flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1 text-xs font-medium text-white" type="submit">
                      <Plus className="h-3.5 w-3.5" /> Add
                    </button>
                  </form>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">
                AI-suggested from {research.model}
                {asset.researched_at && ` on ${asset.researched_at.slice(0, 10)}`}. Nothing is scheduled until you add
                it; the owner&apos;s manual wins where they disagree.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h2 className="font-semibold">Custom recurring item</h2>
          <form action={`${here}/schedule`} method="post" className="mt-3 grid gap-2">
            <input name="title" required placeholder="What — e.g. Replace pool pump seal" className={input} />
            <textarea name="instructions" rows={2} placeholder="How (optional)" className={input} />
            <RecurrencePicker defaultEnabled />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                First due
                <input name="due_date" type="date" className={`${input} mt-1 w-full`} />
              </label>
              {unit && (
                <label className="text-xs text-slate-500">
                  Or every N {unit}
                  <input name="meter_interval" type="number" step="any" className={`${input} mt-1 w-full`} />
                </label>
              )}
            </div>
            <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white" type="submit">
              Add to schedule
            </button>
          </form>
        </div>

        <div className={card}>
          <h2 className="font-semibold">Details</h2>
          <form action={`${here}/update`} method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
            <input name="name" defaultValue={asset.name} required className={input} aria-label="Name" />
            <select name="category" defaultValue={asset.category} className={`${input} bg-white`} aria-label="Type">
              {CATEGORY_KEYS.map((k) => (
                <option key={k} value={k}>{CATEGORIES[k].label}</option>
              ))}
            </select>
            <input name="make" defaultValue={asset.make ?? ''} placeholder="Make" className={input} />
            <input name="model" defaultValue={asset.model ?? ''} placeholder="Model" className={input} />
            <input name="model_year" type="number" defaultValue={asset.model_year ?? ''} placeholder="Year" className={input} />
            <input name="serial_number" defaultValue={asset.serial_number ?? ''} placeholder="Serial / VIN" className={input} />
            <input name="location" defaultValue={asset.location ?? ''} placeholder="Location" className={input} />
            <label className="text-xs text-slate-500">
              Purchased
              <input name="purchased_on" type="date" defaultValue={asset.purchased_on ?? ''} className={`${input} mt-1 w-full`} />
            </label>
            <select name="meter_unit" defaultValue={asset.meter_unit ?? ''} className={`${input} bg-white`} aria-label="Meter">
              <option value="">No meter</option>
              <option value="hours">Hour meter</option>
              <option value="miles">Odometer (miles)</option>
            </select>
            <select name="status" defaultValue={asset.status} className={`${input} bg-white`} aria-label="Status">
              <option value="active">Active</option>
              <option value="stored">Stored</option>
              <option value="retired">Retired (hidden)</option>
            </select>
            <textarea
              name="parts_notes"
              rows={3}
              defaultValue={asset.parts_notes ?? ''}
              placeholder="Parts — filter sizes, oil grade, plug, blade, belt"
              className={`${input} sm:col-span-2`}
            />
            <textarea name="notes" rows={2} defaultValue={asset.notes ?? ''} placeholder="Notes" className={`${input} sm:col-span-2`} />

            <label className="text-xs text-slate-500 sm:col-span-2">
              <span className="flex items-center gap-1"><Landmark className="h-3.5 w-3.5" /> FinanceOS asset</span>
              <select name="finance_asset_id" defaultValue={asset.finance_asset_id ?? ''} className={`${input} mt-1 w-full bg-white`}>
                <option value="">Not linked</option>
                {financeAssets.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}{f.asset_type ? ` (${f.asset_type.replace(/_/g, ' ')})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="sm:col-span-2">
              <button className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-medium text-white" type="submit">Save</button>
            </div>
          </form>

          {asset.finance_asset_id && !linked && (
            <p className="mt-3 text-xs text-red-700">The linked FinanceOS asset was not found — it may have been deleted there.</p>
          )}
          {linked && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              FinanceOS: value {money(linked.estimated_value)} · paid {money(linked.purchase_price)}
              {linked.purchase_date && ` on ${linked.purchase_date}`}
              {linked.mileage !== null && ` · ${linked.mileage.toLocaleString()} mi on record`}
            </div>
          )}
          {financeAssets.length > 0 && !financeAssets.some((f) => ['vehicle', 'equipment', 'personal_property', 'boat'].includes(f.asset_type ?? '')) && (
            <p className="mt-2 text-[11px] text-slate-400">
              FinanceOS holds no vehicles or equipment yet — add them there to link.
            </p>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section id="history" className="mt-8">
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <History className="h-4 w-4 text-slate-600" /> Service history ({log.length})
            </h2>
            {totalCost > 0 && <span className="text-sm text-slate-500">Spent {money(totalCost)}</span>}
          </div>
          <div className="mt-3 grid gap-2">
            {log.length === 0 && <p className="text-sm text-slate-500">Nothing logged yet. Completing a schedule logs it here automatically.</p>}
            {log.map((l) => (
              <div key={l.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2 text-sm last:border-0">
                <div className="min-w-0">
                  <div className="font-medium">{l.title.replace(`${asset.name}: `, '')}</div>
                  <div className="text-xs text-slate-500">
                    {[l.vendor, l.notes].filter(Boolean).join(' — ')}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>{l.performed_on}</div>
                  <div>
                    {l.meter_reading !== null && unit && `${l.meter_reading.toLocaleString()} ${unit}`}
                    {l.cost !== null && ` · ${money(l.cost)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-blue-700">Log a repair or one-off…</summary>
            <form action={`${here}/log`} method="post" className="mt-2 grid gap-2 sm:grid-cols-4">
              <input name="title" required placeholder="What was done" className={`${input} sm:col-span-2`} />
              <input name="performed_on" type="date" defaultValue={todayIso} className={input} aria-label="Date" />
              <input name="cost" type="number" step="0.01" placeholder="Cost $" className={input} />
              <input name="vendor" placeholder="Who" className={input} />
              {unit && <input name="meter_reading" type="number" step="any" placeholder={unit} className={input} />}
              <input name="notes" placeholder="Notes" className={`${input} sm:col-span-2`} />
              <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white sm:col-span-4" type="submit">
                Add to history
              </button>
            </form>
          </details>
        </div>
      </section>

      <section className="mt-8">
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-400">Delete this item…</summary>
          <form action={`${here}/delete`} method="post" className="mt-2 flex flex-wrap items-center gap-2">
            <input name="confirm" placeholder='Type "delete"' className={input} />
            <button className="rounded-xl border border-red-300 px-3 py-2 text-sm text-red-700" type="submit">
              Delete item, its schedules and history
            </button>
            <span className="text-xs text-slate-400">To keep the history, set Status to Retired instead.</span>
          </form>
        </details>
      </section>
    </main>
  )
}
