/**
 * The public job posting. Read with the service role (the page has no user),
 * and returned as ONLY the fields the page shows: whoever opens the link sees
 * the job and nothing else from Mission Control.
 */

import { serviceClient } from '@/lib/helpers/server';

export type PublicPosting = {
  slug: string;
  title: string;
  summary: string | null;
  duties: string[];
  schedule: string | null;
  requirements: string[];
  pay: string | null;
  location: string | null;
  contact_phone: string | null;
};

export async function publicPosting(slug: string): Promise<PublicPosting | null> {
  const { data } = await serviceClient()
    .from('job_postings')
    .select('slug,title,summary,duties,schedule,requirements,pay,location,contact_phone')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();
  return (data as PublicPosting | null) ?? null;
}
