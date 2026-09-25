import type { Reservation, Stop } from '@/lib/rv/trips'
import { toEasternLocal } from '@/lib/rv/form'

const input = 'rounded-xl border border-slate-200 px-3 py-2 text-sm'

/* Reservation fields, shared by "add" and "edit". */
export default function ReservationFields({ r, stops }: { r?: Partial<Reservation>; stops: Stop[] }) {
  return (
    <>
      <select name="stop_id" defaultValue={r?.stop_id ?? ''} className={`${input} bg-white`} aria-label="Stop">
        <option value="">No stop (e.g. tolls)</option>
        {stops.filter((s) => s.kind !== 'home').map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <input name="vendor" defaultValue={r?.vendor ?? ''} placeholder="Vendor — Sun Outdoors, KOA, Steamship Authority" className={input} />
      <select name="kind" defaultValue={r?.kind ?? 'campground'} className={`${input} bg-white`} aria-label="Kind">
        {['campground', 'ferry', 'hotel', 'storage', 'day-use', 'toll', 'other'].map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
      <select name="status" defaultValue={r?.status ?? 'to-book'} className={`${input} bg-white`} aria-label="Status">
        <option value="to-book">To book</option>
        <option value="booked">Booked</option>
        <option value="confirmed">Confirmed</option>
        <option value="canceled">Canceled</option>
      </select>
      <input name="conf_number" defaultValue={r?.conf_number ?? ''} placeholder="Confirmation #" className={input} />
      <input name="secondary_ref" defaultValue={r?.secondary_ref ?? ''} placeholder="Invoice / profile / password" className={input} />
      <input name="site_type" defaultValue={r?.site_type ?? ''} placeholder="Site type — FHU 30/50 pull-thru" className={input} />
      <select name="pull_through" defaultValue={r?.pull_through === true ? 'yes' : r?.pull_through === false ? 'no' : ''} className={`${input} bg-white`} aria-label="Pull-through">
        <option value="">Pull-through?</option>
        <option value="yes">Pull-through</option>
        <option value="no">Back-in</option>
      </select>
      <input name="amp" type="number" defaultValue={r?.amp ?? ''} placeholder="Amps (30 / 50)" className={input} />
      <input name="hookups" defaultValue={r?.hookups ?? ''} placeholder="Hookups — full, water+electric" className={input} />
      <input name="check_in" defaultValue={r?.check_in ?? ''} placeholder="Check-in — 2:00 PM" className={input} />
      <input name="check_out" defaultValue={r?.check_out ?? ''} placeholder="Check-out — 11:00 AM" className={input} />
      <input name="paid" type="number" step="0.01" defaultValue={r?.paid ?? ''} placeholder="Paid $" className={input} />
      <input name="balance_due" type="number" step="0.01" defaultValue={r?.balance_due ?? ''} placeholder="Balance due $" className={input} />
      <label className="text-xs text-slate-500">
        Cancel by (Eastern)
        <input name="cancel_by" type="datetime-local" defaultValue={toEasternLocal(r?.cancel_by ?? null)} className={`${input} mt-1 w-full`} />
      </label>
      <input name="booking_fee" type="number" step="0.01" defaultValue={r?.booking_fee ?? ''} placeholder="Booking fee $" className={input} />
      <textarea name="cancel_policy" rows={2} defaultValue={r?.cancel_policy ?? ''} placeholder="Cancel policy" className={`${input} sm:col-span-2`} />
      <textarea name="day_of_notes" rows={2} defaultValue={r?.day_of_notes ?? ''} placeholder="Day-of notes — arrive by, propane off, approach route" className={`${input} sm:col-span-2`} />
    </>
  )
}
