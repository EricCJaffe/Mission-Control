import { redirect } from 'next/navigation';

/**
 * Class logging moved into the main logger.
 *
 * Kept as a redirect rather than deleted: the old path exists in history, in
 * the dashboard button before it was repointed, and possibly in a bookmark.
 */
export default function LogClassPage() {
  redirect('/fitness/log?type=jiujitsu');
}
