// ============================================================
// OpenWeatherMap Client
// Jacksonville, FL — zip 32234
// ============================================================

const BASE_URL = 'https://api.openweathermap.org/data/2.5';
const ZIP = '32234,US';
const UNITS = 'imperial';

export type CurrentWeather = {
  temp_f: number;
  feels_like_f: number;
  humidity: number;
  wind_mph: number;
  conditions: string;
  conditions_icon: string;
  heat_index_f: number;
  uv_index: number | null;
  zone_adjustment_bpm: number;
  advisory: string | null;
};

export type ForecastDay = {
  date: string;           // YYYY-MM-DD
  high_f: number;
  low_f: number;
  conditions: string;
  conditions_icon: string;
  humidity: number;
  heat_index_f: number;
  zone_adjustment_bpm: number;
};

/**
 * Calculate heat index (Rothfusz equation, imperial units).
 * Returns temp_f when humidity < 40% or temp < 80°F.
 */
export function calcHeatIndex(temp_f: number, humidity: number): number {
  if (temp_f < 80) return temp_f;
  const hi =
    -42.379 +
    2.04901523 * temp_f +
    10.14333127 * humidity -
    0.22475541 * temp_f * humidity -
    0.00683783 * temp_f * temp_f -
    0.05481717 * humidity * humidity +
    0.00122874 * temp_f * temp_f * humidity +
    0.00085282 * temp_f * humidity * humidity -
    0.00000199 * temp_f * temp_f * humidity * humidity;
  return Math.round(hi * 10) / 10;
}

/**
 * Determine HR zone adjustment (bpm) based on heat index.
 * Negative values = lower zone ceilings for safety.
 */
export function calcZoneAdjustment(heat_index_f: number): number {
  if (heat_index_f >= 95) return -5;
  if (heat_index_f >= 90) return -5;
  if (heat_index_f >= 85) return -3;
  return 0;
}

/**
 * Build a weather advisory string based on conditions.
 */
export function buildAdvisory(heat_index_f: number, conditions: string): string | null {
  const lc = conditions.toLowerCase();
  if (lc.includes('thunder') || lc.includes('storm')) {
    return 'Thunderstorm — indoor training strongly recommended.';
  }
  if (heat_index_f >= 95) {
    return `Heat index ${heat_index_f}°F — indoor training strongly recommended. Zones adjusted -5 bpm.`;
  }
  if (heat_index_f >= 90) {
    return `Heat index ${heat_index_f}°F — consider indoor training. Zones adjusted -5 bpm if outdoor.`;
  }
  if (heat_index_f >= 85) {
    return `Heat index ${heat_index_f}°F — extra hydration. Z2 ceiling lowered to 130, Z4 to 150.`;
  }
  if (heat_index_f >= 80) {
    return `Heat index ${heat_index_f}°F — stay well hydrated.`;
  }
  return null;
}

function getApiKey(): string {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) throw new Error('OPENWEATHER_API_KEY is not configured');
  return key;
}

/** Fetch current weather conditions. */
export async function getCurrentWeather(): Promise<CurrentWeather> {
  const key = getApiKey();
  const res = await fetch(
    `${BASE_URL}/weather?zip=${ZIP}&appid=${key}&units=${UNITS}`,
    { next: { revalidate: 1800 } } // cache 30 min
  );

  if (!res.ok) {
    throw new Error(`Weather API error: ${res.status}`);
  }

  const data = await res.json();
  const temp_f: number = data.main.temp;
  const feels_like_f: number = data.main.feels_like;
  const humidity: number = data.main.humidity;
  const wind_mph: number = data.wind?.speed ?? 0;
  const conditions: string = data.weather?.[0]?.description ?? 'unknown';
  const conditions_icon: string = data.weather?.[0]?.icon ?? '';
  const heat_index_f = calcHeatIndex(temp_f, humidity);
  const zone_adjustment_bpm = calcZoneAdjustment(heat_index_f);

  return {
    temp_f: Math.round(temp_f),
    feels_like_f: Math.round(feels_like_f),
    humidity,
    wind_mph: Math.round(wind_mph),
    conditions,
    conditions_icon,
    heat_index_f,
    uv_index: null, // not in current weather endpoint; use UV endpoint if needed
    zone_adjustment_bpm,
    advisory: buildAdvisory(heat_index_f, conditions),
  };
}

/** Fetch 5-day forecast, collapsed to daily. */
export async function getWeatherForecast(): Promise<ForecastDay[]> {
  const key = getApiKey();
  const res = await fetch(
    `${BASE_URL}/forecast?zip=${ZIP}&appid=${key}&units=${UNITS}`,
    { next: { revalidate: 3600 } } // cache 1 hour
  );

  if (!res.ok) {
    throw new Error(`Weather API error: ${res.status}`);
  }

  const data = await res.json();
  const list: Array<{
    dt_txt: string;
    main: { temp: number; temp_min: number; temp_max: number; humidity: number };
    weather: Array<{ description: string; icon: string }>;
  }> = data.list;

  // Collapse 3-hour forecasts into daily summaries
  const byDay = new Map<string, typeof list>();
  for (const entry of list) {
    const date = entry.dt_txt.slice(0, 10);
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date)!.push(entry);
  }

  const days: ForecastDay[] = [];
  for (const [date, entries] of byDay) {
    const highs = entries.map((e) => e.main.temp_max ?? e.main.temp);
    const lows = entries.map((e) => e.main.temp_min ?? e.main.temp);
    const humidities = entries.map((e) => e.main.humidity);
    const high_f = Math.round(Math.max(...highs));
    const low_f = Math.round(Math.min(...lows));
    const humidity = Math.round(humidities.reduce((a, b) => a + b, 0) / humidities.length);
    const midEntry = entries[Math.floor(entries.length / 2)];
    const conditions = midEntry.weather?.[0]?.description ?? 'unknown';
    const conditions_icon = midEntry.weather?.[0]?.icon ?? '';
    const heat_index_f = calcHeatIndex(high_f, humidity);
    const zone_adjustment_bpm = calcZoneAdjustment(heat_index_f);

    days.push({ date, high_f, low_f, conditions, conditions_icon, humidity, heat_index_f, zone_adjustment_bpm });
  }

  return days.slice(0, 5);
}
