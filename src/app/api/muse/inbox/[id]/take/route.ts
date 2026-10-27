import { museTake } from '@/lib/muse/handlers';
import { museDeps } from '@/lib/muse/server';

export const dynamic = 'force-dynamic';

/** Muse Code: claim an ask (new -> taken; 409 from any other status). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return museTake(req, id, museDeps());
}
