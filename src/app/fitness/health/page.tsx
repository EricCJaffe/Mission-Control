import { redirect } from 'next/navigation';

/**
 * /fitness/health had no page of its own — only child routes — so linking to
 * it 404'd. The health document lives at /fitness/health/view; this redirects
 * rather than just fixing the one nav link, because any other reference to the
 * bare path (a bookmark, an old link, a future component) should land
 * somewhere sensible too.
 */
export default function HealthIndexPage() {
  redirect('/fitness/health/view');
}
