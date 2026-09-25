import type { Stop } from '@/lib/rv/trips'

const input = 'rounded-xl border border-slate-200 px-3 py-2 text-sm'

const KINDS: Array<[string, string]> = [
  ['campground', 'Campground'],
  ['hotel', 'Hotel'],
  ['storage', 'RV storage'],
  ['ferry', 'Ferry crossing'],
  ['excursion', 'Day trip'],
  ['home', 'Home'],
]

/* The stop fields, shared by "new trip", "add stop" and "edit stop". */
export default function StopFields({ stop }: { stop?: Partial<Stop> }) {
  return (
    <>
      <input name="name" required defaultValue={stop?.name ?? ''} placeholder="Name — campground, ferry, hotel" className={input} />
      <select name="kind" defaultValue={stop?.kind ?? 'campground'} className={`${input} bg-white`} aria-label="Kind of stop">
        {KINDS.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <input name="location" defaultValue={stop?.location ?? ''} placeholder="Town, ST" className={input} />
      <input name="address" defaultValue={stop?.address ?? ''} placeholder="Street address" className={input} />
      <label className="text-xs text-slate-500">
        Arrive
        <input name="arrive_on" type="date" defaultValue={stop?.arrive_on ?? ''} className={`${input} mt-1 w-full`} />
      </label>
      <label className="text-xs text-slate-500">
        Depart
        <input name="depart_on" type="date" defaultValue={stop?.depart_on ?? ''} className={`${input} mt-1 w-full`} />
      </label>
      <input name="site" defaultValue={stop?.site ?? ''} placeholder="Site #" className={input} />
      <input name="phone" defaultValue={stop?.phone ?? ''} placeholder="Phone" className={input} />
      <input name="url" defaultValue={stop?.url ?? ''} placeholder="Website" className={input} />
      <input name="leg" defaultValue={stop?.leg ?? ''} placeholder="Leg — northbound, base, homebound" className={input} />
      <input name="seq" type="number" defaultValue={stop?.seq ?? ''} placeholder="Order (optional)" className={input} />
      <input name="day_summary" defaultValue={stop?.day_summary ?? ''} placeholder="The day in one line" className={input} />
      <textarea name="notes" rows={2} defaultValue={stop?.notes ?? ''} placeholder="Notes — gate code, dump station, friends nearby" className={`${input} sm:col-span-2`} />
    </>
  )
}
