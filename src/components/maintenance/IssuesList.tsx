import { AlertTriangle } from 'lucide-react'

export type IssueRow = {
  id: string
  asset_id: string | null
  title: string
  system: string | null
  status: 'open' | 'scheduled' | 'resolved'
  opened_on: string
  details: string | null
  next_step: string | null
}

export const ISSUE_COLUMNS = 'id,asset_id,title,system,status,opened_on,details,next_step'

const STATUS_CLASS: Record<IssueRow['status'], string> = {
  open: 'bg-red-50 text-red-700 border-red-200',
  scheduled: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  resolved: 'bg-green-50 text-green-700 border-green-200',
}

/*
 * Open issues, with the two moves a person makes on one: book it, or close it.
 * Shared by /maintenance, an asset page and /rv so an issue reads the same
 * wherever it is found. Open is red, scheduled yellow, resolved green.
 */
export default function IssuesList({
  issues,
  redirect,
  assetNames,
}: {
  issues: IssueRow[]
  redirect: string
  assetNames?: Record<string, string>
}) {
  if (issues.length === 0) return <p className="text-sm text-slate-500">No open issues.</p>
  return (
    <div className="grid gap-2">
      {issues.map((i) => (
        <div key={i.id} className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" /> {i.title}
              </div>
              <div className="text-xs text-slate-500">
                {[i.asset_id ? assetNames?.[i.asset_id] : null, i.system, `opened ${i.opened_on}`].filter(Boolean).join(' · ')}
              </div>
            </div>
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[i.status]}`}>{i.status}</span>
          </div>
          {i.details && <p className="mt-2 text-sm text-slate-700">{i.details}</p>}
          {i.next_step && (
            <p className="mt-1 text-sm">
              <span className="font-medium">Next: </span>
              {i.next_step}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {i.status !== 'scheduled' && (
              <form action={`/maintenance/issues/${i.id}/update`} method="post">
                <input type="hidden" name="redirect" value={redirect} />
                <input type="hidden" name="status" value="scheduled" />
                <button className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700" type="submit">
                  Scheduled
                </button>
              </form>
            )}
            <form action={`/maintenance/issues/${i.id}/update`} method="post">
              <input type="hidden" name="redirect" value={redirect} />
              <input type="hidden" name="status" value="resolved" />
              <button
                className="min-h-[36px] rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:border-green-300 hover:text-green-700"
                type="submit"
              >
                Resolved
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  )
}

/* The add form, with the asset preselected when there is one. */
export function AddIssueForm({ redirect, assetId, assets }: { redirect: string; assetId?: string; assets?: Array<{ id: string; name: string }> }) {
  const input = 'rounded-xl border border-slate-200 px-3 py-2 text-sm'
  return (
    <form action="/maintenance/issues/new" method="post" className="mt-3 grid gap-2 sm:grid-cols-2">
      <input type="hidden" name="redirect" value={redirect} />
      {assetId ? (
        <input type="hidden" name="asset_id" value={assetId} />
      ) : (
        assets && (
          <select name="asset_id" defaultValue="" className={`${input} bg-white`} aria-label="Which item">
            <option value="">Not tied to an item</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )
      )}
      <input name="title" required placeholder="What is wrong — e.g. fault code 45" className={input} />
      <input name="system" placeholder="System — generator, chassis, propane" className={input} />
      <input name="next_step" placeholder="Next step" className={input} />
      <textarea name="details" rows={2} placeholder="Details" className={`${input} sm:col-span-2`} />
      <button className="rounded-xl bg-blue-700 px-3 py-2 text-sm font-medium text-white sm:col-span-2" type="submit">Log issue</button>
    </form>
  )
}
