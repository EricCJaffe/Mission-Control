/** Stop fields from a form post, shared by the add and edit routes. */

import { date, num, text } from '@/lib/maintenance/form'

export function stopFields(form: FormData) {
  return {
    campground: text(form, 'campground'),
    location: text(form, 'location'),
    site: text(form, 'site'),
    arrive_on: date(form, 'arrive_on'),
    depart_on: date(form, 'depart_on'),
    confirmation: text(form, 'confirmation'),
    cost: num(form, 'cost'),
    hookups: text(form, 'hookups'),
    url: text(form, 'url'),
    phone: text(form, 'phone'),
    notes: text(form, 'notes'),
  }
}
