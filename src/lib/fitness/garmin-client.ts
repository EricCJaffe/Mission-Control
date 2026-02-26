// ============================================================
// GARMIN CONNECT CLIENT — OAuth authentication and API wrapper
// Architecture inspired by python-garminconnect
// ============================================================

import { request } from 'undici';
import { CookieJar } from 'tough-cookie';
import type { GarminTokens } from './garmin-tokens';

const SSO_URL = 'https://sso.garmin.com';
const CONNECT_URL = 'https://connect.garmin.com';
const MODERN_URL = `${CONNECT_URL}/modern`;

export type DailySummary = {
  calendarDate: string;
  restingHeartRate: number | null;
  totalSteps: number | null;
  totalKilocalories: number | null;
  activeKilocalories: number | null;
  bmrKilocalories: number | null;
  maxHeartRate: number | null;
  minHeartRate: number | null;
};

export type HRVData = {
  calendarDate: string;
  lastNightAvg: number | null;
  lastNight5MinHigh: number | null;
  lastNight5MinLow: number | null;
  status: string | null;
};

export type BodyBatteryData = {
  date: string;
  charged: number | null;
  drained: number | null;
  highest: number | null;
  lowest: number | null;
};

export type SleepData = {
  calendarDate: string;
  sleepTimeSeconds: number | null;
  deepSleepSeconds: number | null;
  lightSleepSeconds: number | null;
  remSleepSeconds: number | null;
  awakeSleepSeconds: number | null;
  sleepScore: number | null;
};

export type Activity = {
  activityId: number;
  activityName: string;
  activityType: { typeKey: string };
  startTimeLocal: string;
  duration: number; // seconds
  distance: number | null; // meters
  averageHR: number | null;
  maxHR: number | null;
  calories: number | null;
};

export type ActivityDetail = Activity & {
  averageSpeed: number | null; // m/s
  averagePower: number | null; // watts
  maxPower: number | null;
  normalizedPower: number | null;
  trainingEffect: number | null;
  anaerobicTrainingEffect: number | null;
};

export type HRZoneData = {
  zones: Array<{
    zoneNumber: number;
    secsInZone: number;
  }>;
};

/**
 * MFA challenge response from Garmin.
 */
export type MFAChallenge = {
  mfaRequired: true;
  mfaTicket: string;
};

/**
 * Garmin Connect API client with OAuth authentication.
 */
export class GarminClient {
  private cookieJar: CookieJar;
  private tokens: GarminTokens | null = null;
  private displayName: string | null = null;
  private email: string;
  private password: string;
  private mfaCode: string | null = null;

  constructor(email: string, password: string, mfaCode?: string) {
    this.email = email;
    this.password = password;
    this.mfaCode = mfaCode || null;
    this.cookieJar = new CookieJar();
  }

  /**
   * Set tokens directly (used when loading from database).
   */
  setTokens(tokens: GarminTokens) {
    this.tokens = tokens;
  }

  /**
   * Get current tokens (for storage).
   */
  getTokens(): GarminTokens | null {
    return this.tokens;
  }

  /**
   * Authenticate with Garmin SSO and obtain OAuth tokens.
   * Throws MFAChallenge if MFA code is required.
   */
  async login(): Promise<void | MFAChallenge> {
    try {
      // Step 1: GET login page to initialize session
      const loginPageRes = await request(`${SSO_URL}/sso/signin?service=https://connect.garmin.com/modern/`, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      const loginPageHtml = await loginPageRes.body.text();

      // Extract CSRF token from hidden input or script
      let csrfToken = '';
      const csrfInputMatch = loginPageHtml.match(/name="_csrf"\s+value="([^"]+)"/);
      const csrfScriptMatch = loginPageHtml.match(/"_csrf"\s*:\s*"([^"]+)"/);
      csrfToken = csrfInputMatch ? csrfInputMatch[1] : (csrfScriptMatch ? csrfScriptMatch[1] : '');

      console.log('CSRF token found:', csrfToken ? 'yes' : 'no');

      // Store cookies from login page
      const initCookies = loginPageRes.headers['set-cookie'];
      if (initCookies) {
        const cookieArray = Array.isArray(initCookies) ? initCookies : [initCookies];
        for (const cookie of cookieArray) {
          await this.cookieJar.setCookie(cookie, SSO_URL);
        }
      }

      // Step 2: POST credentials to SSO with proper headers
      const signinRes = await request(`${SSO_URL}/sso/signin?service=https://connect.garmin.com/modern/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': SSO_URL,
          'Referer': `${SSO_URL}/sso/signin?service=https://connect.garmin.com/modern/`,
          'Cookie': await this.getCookieHeader(SSO_URL),
        },
        body: JSON.stringify({
          username: this.email,
          password: this.password,
          embed: true,
          _csrf: csrfToken,
        }),
      });

      const responseText = await signinRes.body.text();

      // Debug: Log response type and first 500 chars
      console.log('Response status:', signinRes.statusCode);
      console.log('Response content-type:', signinRes.headers['content-type']);
      console.log('Response preview:', responseText.substring(0, 500));

      // Try to parse as JSON, but handle HTML responses
      let signinData: any;
      try {
        signinData = JSON.parse(responseText);
        console.log('Garmin signin response:', JSON.stringify(signinData, null, 2));
      } catch (e) {
        // Response is HTML - check if it contains ticket
        console.log('Response is HTML, checking for ticket...');
        const ticketMatch = responseText.match(/ticket=([^"&]+)/);
        if (ticketMatch) {
          console.log('Found ticket in HTML:', ticketMatch[1]);
          const serviceTicket = ticketMatch[1];
          return this.completeLogin(serviceTicket, signinRes);
        }
        throw new Error('Garmin returned HTML instead of JSON - authentication may have failed');
      }

      // Check for MFA challenge - Garmin may return various indicators
      const isMFARequired =
        signinData.mfaRequired === true ||
        signinData.serviceTicketId === 'MFA_REQUIRED' ||
        signinData.serviceTicketId === 'ACCOUNT_LOCKED' ||
        (signinData.serviceTicketId && String(signinData.serviceTicketId).includes('MFA')) ||
        signinData.errors?.some((e: any) => e.code === 'MFA_REQUIRED');

      if (isMFARequired) {
        console.log('MFA detected! serviceTicketId:', signinData.serviceTicketId);

        // MFA is required
        if (!this.mfaCode) {
          // Return MFA challenge - caller needs to provide MFA code
          const mfaTicket = signinData.ticket || signinData.serviceTicketId || 'mfa-required';
          return {
            mfaRequired: true,
            mfaTicket,
          };
        }

        // MFA code provided, submit it
        const mfaRes = await request(`${SSO_URL}/sso/verifyMFA/loginEnterMfaCode`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Cookie': await this.getCookieHeader(SSO_URL),
          },
          body: JSON.stringify({
            mfa_code: this.mfaCode,
            embed: true,
            _csrf: csrfToken,
          }),
        });

        const mfaData = await mfaRes.body.json() as any;

        if (!mfaData.serviceTicket || mfaData.serviceTicketId === 'INVALID_MFA_CODE') {
          throw new Error('Invalid MFA code');
        }

        // MFA successful, continue with service ticket
        const serviceTicket = mfaData.serviceTicket.ticket;
        return this.completeLogin(serviceTicket, signinRes);
      }

      // No MFA - standard flow
      if (!signinData.serviceTicket || signinData.serviceTicketId === 'INVALID_CREDENTIALS') {
        throw new Error('Invalid Garmin credentials');
      }

      const serviceTicket = signinData.serviceTicket.ticket;
      return this.completeLogin(serviceTicket, signinRes);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Garmin authentication failed: ${message}`);
    }
  }

  /**
   * Complete login after obtaining service ticket (separated for MFA flow).
   */
  private async completeLogin(serviceTicket: string, signinRes: Awaited<ReturnType<typeof request>>): Promise<void> {
    // Store cookies
    const cookies = signinRes.headers['set-cookie'];
    if (cookies) {
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      for (const cookie of cookieArray) {
        await this.cookieJar.setCookie(cookie, SSO_URL);
      }
    }

    // Step 3: Exchange service ticket for Connect session
    const ticketRes = await request(`${MODERN_URL}/?ticket=${serviceTicket}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    const ticketCookies = ticketRes.headers['set-cookie'];
    if (ticketCookies) {
      const cookieArray = Array.isArray(ticketCookies) ? ticketCookies : [ticketCookies];
      for (const cookie of cookieArray) {
        await this.cookieJar.setCookie(cookie, CONNECT_URL);
      }
    }

    // Step 4: Get user profile to extract displayName
    const profileRes = await this.authenticatedRequest('/userprofile-service/socialProfile');
    const profileData = await profileRes.body.json() as any;
    this.displayName = profileData.displayName || profileData.userName || this.email.split('@')[0];

    // Store basic token structure
    this.tokens = {
      oauth1_token: serviceTicket,
      oauth1_token_secret: '',
      oauth2_token: null,
      oauth2_refresh_token: null,
      oauth2_expires_at: null,
      session_cookie: await this.getCookieHeader(CONNECT_URL),
    };

    console.log(`✓ Garmin authenticated as ${this.displayName}`);
  }

  /**
   * Make authenticated request to Garmin Connect API.
   */
  private async authenticatedRequest(
    endpoint: string,
    options: { method?: string; body?: any } = {}
  ): Promise<Awaited<ReturnType<typeof request>>> {
    const url = endpoint.startsWith('http') ? endpoint : `${CONNECT_URL}${endpoint}`;
    const cookieHeader = await this.getCookieHeader(url);

    return request(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': cookieHeader,
        'Accept': 'application/json',
        ...( options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  }

  /**
   * Get cookie header string from cookie jar.
   */
  private async getCookieHeader(url: string): Promise<string> {
    const cookies = await this.cookieJar.getCookies(url);
    return cookies.map(c => `${c.key}=${c.value}`).join('; ');
  }

  /**
   * Rate limiting helper - delay between requests.
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get daily summary (RHR, steps, calories, HR range).
   */
  async getDailySummary(date: string): Promise<DailySummary | null> {
    if (!this.displayName) await this.login();

    await this.delay(1000); // Rate limit

    const res = await this.authenticatedRequest(
      `/usersummary-service/usersummary/daily/${this.displayName}?calendarDate=${date}`
    );

    if (res.statusCode === 404) return null;
    if (res.statusCode !== 200) throw new Error(`Failed to fetch daily summary: ${res.statusCode}`);

    const data = await res.body.json() as any;
    return {
      calendarDate: data.calendarDate,
      restingHeartRate: data.restingHeartRate ?? null,
      totalSteps: data.totalSteps ?? null,
      totalKilocalories: data.totalKilocalories ?? null,
      activeKilocalories: data.activeKilocalories ?? null,
      bmrKilocalories: data.bmrKilocalories ?? null,
      maxHeartRate: data.maxHeartRate ?? null,
      minHeartRate: data.minHeartRate ?? null,
    };
  }

  /**
   * Get daily HRV metrics.
   */
  async getDailyHRV(date: string): Promise<HRVData | null> {
    await this.delay(1000);

    const res = await this.authenticatedRequest(`/hrv-service/hrv/${date}`);

    if (res.statusCode === 404) return null;
    if (res.statusCode !== 200) throw new Error(`Failed to fetch HRV: ${res.statusCode}`);

    const data = await res.body.json() as any;
    return {
      calendarDate: data.calendarDate,
      lastNightAvg: data.lastNightAvg ?? null,
      lastNight5MinHigh: data.lastNight5MinHigh ?? null,
      lastNight5MinLow: data.lastNight5MinLow ?? null,
      status: data.status ?? null,
    };
  }

  /**
   * Get body battery data.
   */
  async getBodyBattery(date: string): Promise<BodyBatteryData | null> {
    await this.delay(1000);

    const res = await this.authenticatedRequest(
      `/wellness-service/wellness/bodyBattery/events/${date}`
    );

    if (res.statusCode === 404) return null;
    if (res.statusCode !== 200) throw new Error(`Failed to fetch body battery: ${res.statusCode}`);

    const data = await res.body.json() as any;
    const events = Array.isArray(data) ? data : [];

    if (events.length === 0) return null;

    return {
      date,
      charged: events[0]?.charged ?? null,
      drained: events[0]?.drained ?? null,
      highest: events[0]?.highest ?? null,
      lowest: events[0]?.lowest ?? null,
    };
  }

  /**
   * Get sleep data.
   */
  async getSleepData(date: string): Promise<SleepData | null> {
    if (!this.displayName) await this.login();

    await this.delay(1000);

    const res = await this.authenticatedRequest(
      `/wellness-service/wellness/dailySleepData/${this.displayName}?date=${date}`
    );

    if (res.statusCode === 404) return null;
    if (res.statusCode !== 200) throw new Error(`Failed to fetch sleep data: ${res.statusCode}`);

    const data = await res.body.json() as any;
    return {
      calendarDate: data.calendarDate || date,
      sleepTimeSeconds: data.sleepTimeSeconds ?? null,
      deepSleepSeconds: data.deepSleepSeconds ?? null,
      lightSleepSeconds: data.lightSleepSeconds ?? null,
      remSleepSeconds: data.remSleepSeconds ?? null,
      awakeSleepSeconds: data.awakeSleepSeconds ?? null,
      sleepScore: data.sleepScore ?? null,
    };
  }

  /**
   * Get list of activities within date range.
   */
  async getActivities(startDate: string, endDate: string, limit = 20): Promise<Activity[]> {
    await this.delay(1000);

    // Calculate date range in seconds since epoch
    const start = new Date(startDate).getTime() / 1000;
    const end = new Date(endDate).getTime() / 1000;

    const res = await this.authenticatedRequest(
      `/activitylist-service/activities/search/activities?start=0&limit=${limit}`
    );

    if (res.statusCode !== 200) throw new Error(`Failed to fetch activities: ${res.statusCode}`);

    const data = await res.body.json() as any;
    const activities = Array.isArray(data) ? data : [];

    // Filter by date range
    return activities
      .filter((a: any) => {
        const activityTime = new Date(a.startTimeLocal).getTime() / 1000;
        return activityTime >= start && activityTime <= end;
      })
      .map((a: any) => ({
        activityId: a.activityId,
        activityName: a.activityName,
        activityType: a.activityType || { typeKey: 'unknown' },
        startTimeLocal: a.startTimeLocal,
        duration: a.duration ?? 0,
        distance: a.distance ?? null,
        averageHR: a.averageHR ?? null,
        maxHR: a.maxHR ?? null,
        calories: a.calories ?? null,
      }));
  }

  /**
   * Get detailed activity data including power metrics.
   */
  async getActivityDetails(activityId: number): Promise<ActivityDetail | null> {
    await this.delay(1000);

    const res = await this.authenticatedRequest(
      `/activity-service/activity/${activityId}`
    );

    if (res.statusCode === 404) return null;
    if (res.statusCode !== 200) throw new Error(`Failed to fetch activity details: ${res.statusCode}`);

    const data = await res.body.json() as any;
    return {
      activityId: data.activityId,
      activityName: data.activityName,
      activityType: data.activityType || { typeKey: 'unknown' },
      startTimeLocal: data.startTimeLocal,
      duration: data.duration ?? 0,
      distance: data.distance ?? null,
      averageHR: data.averageHR ?? null,
      maxHR: data.maxHR ?? null,
      calories: data.calories ?? null,
      averageSpeed: data.averageSpeed ?? null,
      averagePower: data.avgPower ?? null,
      maxPower: data.maxPower ?? null,
      normalizedPower: data.normPower ?? null,
      trainingEffect: data.aerobicTrainingEffect ?? null,
      anaerobicTrainingEffect: data.anaerobicTrainingEffect ?? null,
    };
  }

  /**
   * Get HR zone data for an activity.
   */
  async getActivityHRZones(activityId: number): Promise<HRZoneData | null> {
    await this.delay(1000);

    const res = await this.authenticatedRequest(
      `/activity-service/activity/${activityId}/hrTimeInZones`
    );

    if (res.statusCode === 404) return null;
    if (res.statusCode !== 200) throw new Error(`Failed to fetch HR zones: ${res.statusCode}`);

    const data = await res.body.json() as any;
    const zones = Array.isArray(data) ? data : data.zones || [];

    return {
      zones: zones.map((z: any) => ({
        zoneNumber: z.zoneNumber ?? z.zone ?? 0,
        secsInZone: z.secsInZone ?? z.time ?? 0,
      })),
    };
  }
}
