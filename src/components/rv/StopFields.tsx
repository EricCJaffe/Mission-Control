import type { Stop } from '@/lib/rv/trips'

const input = 'rounded-xl border border-slate-200 px-3 py-2 text-sm'

/* The campground fields, shared by "new trip", "add stop" and "edit stop". */
export default function StopFields({ stop }: { stop?: Partial<Stop> }) {
  return (
    <>
      <input name="campground" required defaultValue={stop?.campground ?? ''} placeholder="Campground" className={input} />
      <input name="location" defaultValue={stop?.location ?? ''} placeholder="City, state" className={input} />
      <label className="text-xs text-slate-500">
        Arrive
        <input name="arrive_on" type="date" required defaultValue={stop?.arrive_on ?? ''} className={`${input} mt-1 w-full`} />
      </label>
      <label className="text-xs text-slate-500">
        Depart
        <input name="depart_on" type="date" defaultValue={stop?.depart_on ?? ''} className={`${input} mt-1 w-full`} />
      </label>
      <input name="site" defaultValue={stop?.site ?? ''} placeholder="Site #" className={input} />
      <input name="confirmation" defaultValue={stop?.confirmation ?? ''} placeholder="Confirmation #" className={input} />
      <input name="hookups" defaultValue={stop?.hookups ?? ''} placeholder="Hookups — full, 30A, pull-through" className={input} />
      <input name="cost" type="number" step="0.01" defaultValue={stop?.cost ?? ''} placeholder="Cost $" className={input} />
      <input name="phone" defaultValue={stop?.phone ?? ''} placeholder="Phone" className={input} />
      <input name="url" defaultValue={stop?.url ?? ''} placeholder="Website / reservation link" className={input} />
      <textarea name="notes" rows={2} defaultValue={stop?.notes ?? ''} placeholder="Notes — gate code, dump station, check-in time" className={`${input} sm:col-span-2`} />
    </>
  )
}
