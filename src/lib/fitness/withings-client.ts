import type { WithingsTokens } from './withings-tokens';

const DEFAULT_API_BASE_URL = 'https://wbsapi.withings.net';
const AUTH_BASE_URL = 'https://account.withings.com/oauth2_user/authorize2';
const DEFAULT_SCOPES = ['user.metrics', 'user.activity', 'user.sleepevents', 'user.info'];

type WithingsEnvelope<T> = {
  status: number;
  error?: string;
  body?: T;
};

type OAuthBody = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  userid: string | number;
};

type MeasureGroup = {
  date: number;
  category?: number;
  measures?: Array<{ type: number; unit: number; value: number }>;
};

type ActivityRecord = Record<string, unknown> & {
  date?: string;
  steps?: number;
  distance?: number;
  calories?: number;
  totalcalories?: number;
  elevation?: number;
  hr_average?: number;
  hr_min?: number;
  hr_max?: number;
};

type SleepSeries = Record<string, unknown> & {
  startdate?: number;
  enddate?: number;
};

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function parseJsonSafely<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Withings returned invalid JSON: ${raw.slice(0, 300)}`);
  }
}

export function getWithingsScopes(): string[] {
  return DEFAULT_SCOPES;
}

export function buildWithingsAuthorizeUrl(state: string): string {
  const callbackUrl = getEnv('WITHINGS_CALLBACK_URL');
  const clientId = getEnv('WITHINGS_CLIENT_ID');
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: DEFAULT_SCOPES.join(','),
    state,
  });

  return `${AUTH_BASE_URL}?${params.toString()}`;
}

export class WithingsClient {
  private apiBaseUrl: string;
  private tokens: WithingsTokens | null;

  constructor(tokens?: WithingsTokens | null, apiBaseUrl?: string) {
    this.apiBaseUrl = apiBaseUrl || process.env.WITHINGS_API_BASE_URL || DEFAULT_API_BASE_URL;
    this.tokens = tokens ?? null;
  }

  getTokens() {
    return this.tokens;
  }

  async exchangeAuthorizationCode(code: string): Promise<WithingsTokens> {
    const body = await this.requestOAuthToken({
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id: getEnv('WITHINGS_CLIENT_ID'),
      client_secret: getEnv('WITHINGS_CLIENT_SECRET'),
      code,
      redirect_uri: getEnv('WITHINGS_CALLBACK_URL'),
    });

    const tokens = this.toTokens(body);
    this.tokens = tokens;
    return tokens;
  }

  async refreshAccessToken(refreshToken?: string): Promise<WithingsTokens> {
    const current = refreshToken || this.tokens?.refresh_token;
    if (!current) {
      throw new Error('No Withings refresh token available');
    }

    const body = await this.requestOAuthToken({
      action: 'requesttoken',
      grant_type: 'refresh_token',
      client_id: getEnv('WITHINGS_CLIENT_ID'),
      client_secret: getEnv('WITHINGS_CLIENT_SECRET'),
      refresh_token: current,
    });

    const tokens = this.toTokens(body);
    this.tokens = tokens;
    return tokens;
  }

  async ensureValidToken(): Promise<WithingsTokens> {
    if (!this.tokens) {
      throw new Error('Withings tokens are not loaded');
    }

    if (new Date(this.tokens.expires_at) <= new Date(Date.now() + 5 * 60 * 1000)) {
      await this.refreshAccessToken(this.tokens.refresh_token);
    }

    return this.tokens;
  }

  async getMeasures(startDate: Date, endDate: Date): Promise<MeasureGroup[]> {
    const response = await this.authedRequest<{ measuregrps?: MeasureGroup[] }>('/measure', {
      action: 'getmeas',
      startdate: Math.floor(startDate.getTime() / 1000).toString(),
      enddate: Math.floor(endDate.getTime() / 1000).toString(),
    });

    return response.measuregrps || [];
  }

  async getActivitySummaries(startDate: string, endDate: string): Promise<ActivityRecord[]> {
    const response = await this.authedRequest<{ activities?: ActivityRecord[] }>('/v2/measure', {
      action: 'getactivity',
      startdateymd: startDate,
      enddateymd: endDate,
    });

    return response.activities || [];
  }

  async getSleepSummary(startDate: string, endDate: string): Promise<SleepSeries[]> {
    const response = await this.authedRequest<{ series?: SleepSeries[] }>('/v2/sleep', {
      action: 'getsummary',
      startdateymd: startDate,
      enddateymd: endDate,
      data_fields: 'hr_average,hr_max,hr_min,rr_average,snoring,total_sleep_duration,wakeupcount,wakeupduration,durationtosleep,durationtowakeup,remsleepduration,deepsleepduration,lightsleepduration',
    });

    return response.series || [];
  }

  private async requestOAuthToken(params: Record<string, string>): Promise<OAuthBody> {
    const response = await fetch(`${this.apiBaseUrl}/v2/oauth2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
      cache: 'no-store',
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw || `Withings OAuth request failed with ${response.status}`);
    }

    const payload = parseJsonSafely<WithingsEnvelope<OAuthBody>>(raw);
    if (payload.status !== 0 || !payload.body) {
      throw new Error(payload.error || `Withings OAuth request failed with status ${payload.status}`);
    }

    return payload.body;
  }

  private async authedRequest<T>(path: string, params: Record<string, string>): Promise<T> {
    const tokens = await this.ensureValidToken();
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
      cache: 'no-store',
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(raw || `Withings API request failed with ${response.status}`);
    }

    const payload = parseJsonSafely<WithingsEnvelope<T>>(raw);
    if (payload.status !== 0 || !payload.body) {
      throw new Error(
        payload.error || `Withings API request failed for ${path} (${params.action || 'unknown action'}) with status ${payload.status}`
      );
    }

    return payload.body;
  }

  private toTokens(body: OAuthBody): WithingsTokens {
    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: new Date(Date.now() + body.expires_in * 1000).toISOString(),
      scope: body.scope,
      userid: String(body.userid),
    };
  }
}

export type WithingsMeasureGroup = MeasureGroup;
export type WithingsActivityRecord = ActivityRecord;
export type WithingsSleepSeries = SleepSeries;
