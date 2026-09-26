import { IssuesTable } from './MaintenanceTables'

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

/*
 * Open issues, shared by /maintenance, an asset page and /rv so an issue reads
 * the same wherever it is found. The table itself is a client component
 * (IssuesTable); this module stays server-safe because the pages read
 * ISSUE_COLUMNS from it, and a constant imported from a 'use client' module is
 * a reference on the server, not the string.
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
  return <IssuesTable issues={issues} redirect={redirect} assetNames={assetNames} />
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
