/** Form parsing shared by the RV routes. */

import { date, num, text } from '@/lib/maintenance/form'

const STOP_KINDS = new Set(['home', 'campground', 'ferry', 'excursion', 'hotel', 'storage'])

export function stopFields(form: FormData) {
  const kind = text(form, 'kind') ?? 'campground'
  return {
    name: text(form, 'name'),
    kind: STOP_KINDS.has(kind) ? kind : 'campground',
    location: text(form, 'location'),
    address: text(form, 'address'),
    site: text(form, 'site'),
    arrive_on: date(form, 'arrive_on'),
    depart_on: date(form, 'depart_on'),
    seq: num(form, 'seq'),
    leg: text(form, 'leg'),
    day_summary: text(form, 'day_summary'),
    confirmation: text(form, 'confirmation'),
    cost: num(form, 'cost'),
    hookups: text(form, 'hookups'),
    url: text(form, 'url'),
    phone: text(form, 'phone'),
    notes: text(form, 'notes'),
  }
}

const RES_KINDS = new Set(['campground', 'ferry', 'toll', 'hotel', 'storage', 'day-use', 'other'])
const RES_STATUSES = new Set(['to-book', 'booked', 'confirmed', 'canceled'])

/*
 * `cancel_by` arrives from a datetime-local input with no zone. It is read as
 * Eastern, which is the zone every deadline so far has been written in; a
 * browser elsewhere would otherwise shift "2 PM" by its own offset.
 */
function easternInstant(local: string | null): string | null {
  if (!local || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local)) return null
  const guess = new Date(`${local}:00Z`)
  const eastern = new Date(guess.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() + (utc.getTime() - eastern.getTime())).toISOString()
}

export function reservationFields(form: FormData) {
  const kind = text(form, 'kind') ?? 'campground'
  const status = text(form, 'status') ?? 'to-book'
  const pt = text(form, 'pull_through')
  return {
    stop_id: text(form, 'stop_id'),
    vendor: text(form, 'vendor'),
    kind: RES_KINDS.has(kind) ? kind : 'other',
    status: RES_STATUSES.has(status) ? status : 'to-book',
    conf_number: text(form, 'conf_number'),
    secondary_ref: text(form, 'secondary_ref'),
    site_type: text(form, 'site_type'),
    pull_through: pt === 'yes' ? true : pt === 'no' ? false : null,
    amp: num(form, 'amp'),
    hookups: text(form, 'hookups'),
    check_in: text(form, 'check_in'),
    check_out: text(form, 'check_out'),
    paid: num(form, 'paid'),
    balance_due: num(form, 'balance_due'),
    booking_fee: num(form, 'booking_fee'),
    cancel_by: easternInstant(text(form, 'cancel_by')),
    cancel_policy: text(form, 'cancel_policy'),
    day_of_notes: text(form, 'day_of_notes'),
    updated_at: new Date().toISOString(),
  }
}

/** A timestamptz as the value a datetime-local input wants, in Eastern. */
export function toEasternLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`
}
