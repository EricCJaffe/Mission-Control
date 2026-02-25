import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getCurrentWeather, getWeatherForecast } from '@/lib/weather';

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') ?? 'current';

  try {
    if (type === 'forecast') {
      const forecast = await getWeatherForecast();
      return NextResponse.json({ forecast });
    }
    const current = await getCurrentWeather();
    return NextResponse.json({ current });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Weather fetch failed';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
