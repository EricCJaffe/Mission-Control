import { redirect } from 'next/navigation';

/**
 * Reviews retired 2026-08-03.
 *
 * The section held three things: a monthly alignment survey that was already
 * switched off by the monthlyAlignment feature flag and had never been
 * completed once (monthly_reviews: 0 rows), two static templates, and a link
 * to Flourishing.
 *
 * Flourishing is the assessment that actually gets taken, and it already has
 * an assessment-history tab, so the periodic self-review lives there. The
 * quarterly and annual templates stay where they are and are reachable from
 * Templates under Admin, which is where the other reference material sits.
 *
 * The monthly_reviews table is deliberately left intact rather than dropped.
 */
export default function ReviewsPage() {
  redirect('/flourishing');
}
