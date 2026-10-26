import { museReply } from '@/lib/muse/handlers';
import { museDeps } from '@/lib/muse/server';

export const dynamic = 'force-dynamic';

/** Muse Code: answer an ask. Body {reply}, at most 20,000 characters. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return museReply(req, id, museDeps());
}
