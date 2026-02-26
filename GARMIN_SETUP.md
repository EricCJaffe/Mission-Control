# Garmin Connect Integration Setup

## Overview

Garmin Connect integration is now implemented! This enables automatic syncing of:
- **Daily Metrics**: RHR, HRV, body battery, sleep score/duration
- **Workout Activities**: Cardio sessions with HR zones, power metrics
- **Auto-matching**: Activities automatically matched to planned workouts

## Architecture

### Components Built

1. **Garmin Client** (`src/lib/fitness/garmin-client.ts`)
   - OAuth1/OAuth2 hybrid authentication with Garmin SSO
   - Session cookie management
   - API methods for daily summaries, HRV, body battery, sleep, activities
   - Rate limiting (1s delay between requests)

2. **Token Manager** (`src/lib/fitness/garmin-tokens.ts`)
   - AES-256-GCM encryption for secure token storage
   - Token expiry detection
   - Functions: `encryptTokens()`, `decryptTokens()`, `isTokenExpired()`

3. **Sync Service** (`src/lib/fitness/garmin-sync-service.ts`)
   - Orchestrates data fetching and transformation
   - Uses existing `garmin-sync.ts` helpers for activity matching
   - Deduplication via `garmin_activity_id`
   - Methods: `syncDailyMetrics()`, `syncActivities()`, `syncAll()`

4. **API Routes**
   - `/api/fitness/garmin/auth` - Authenticate and store credentials
   - `/api/fitness/garmin/sync` - Manual sync trigger
   - `/api/fitness/garmin/status` - Connection status check

5. **UI Components**
   - `/fitness/settings/garmin` - Authentication page
   - Updated `AthleteProfileClient` with Garmin section
   - "Sync Now" button in settings

6. **Database Migration**
   - `20260226000000_garmin_integration.sql`
   - Adds `garmin_email`, `garmin_tokens`, `garmin_last_sync` to `athlete_profile`
   - Creates `garmin_sync_logs` table for debugging

## Setup Instructions

### 1. Install Dependencies

Already done:
```bash
npm install undici tough-cookie
npm install -D @types/tough-cookie
```

### 2. Add Environment Variable

Add to `.env.local`:
```env
# Garmin Connect Integration (keep secret!)
ENCRYPT_KEY=ecf871a5febf9ac189f680bc7ec197088a668f85daf6f5437e5d446c47d82bc0
```

**Security Notes:**
- This key encrypts Garmin OAuth tokens before database storage
- Never commit to version control
- If lost, users must reconnect Garmin accounts
- 32-byte key for AES-256-GCM encryption

### 3. Apply Database Migration

```bash
supabase db push
```

This adds Garmin credential storage columns and sync log table.

### 4. Test the Integration

1. Start dev server:
   ```bash
   npm run dev
   ```

2. Navigate to: http://localhost:3000/fitness/settings

3. Scroll to "Garmin Connect" section

4. Click "Connect Garmin"

5. Enter your Garmin Connect email and password

6. After successful connection, click "Sync Now"

7. Check sync results:
   ```sql
   -- Daily metrics
   SELECT metric_date, resting_hr, hrv_ms, body_battery, sleep_score
   FROM body_metrics
   WHERE garmin_data IS NOT NULL
   ORDER BY metric_date DESC
   LIMIT 7;

   -- Activities
   SELECT workout_date, workout_type, duration_minutes, avg_hr, garmin_activity_id
   FROM workout_logs
   WHERE source = 'garmin'
   ORDER BY workout_date DESC;

   -- Sync logs
   SELECT * FROM garmin_sync_logs ORDER BY sync_started_at DESC LIMIT 5;
   ```

## Usage

### For Users

1. **Connect Garmin Account**
   - Go to Fitness → Settings
   - Click "Connect Garmin"
   - Enter credentials
   - Credentials are encrypted and stored securely

2. **Manual Sync**
   - Go to Fitness → Settings
   - Click "Sync Now"
   - Syncs last 7 days of data
   - Takes ~30-60 seconds

3. **View Synced Data**
   - Daily metrics automatically populate Dashboard readiness cards
   - Activities appear in Workout History
   - Activities auto-match to planned workouts

### Data Flow

1. **Authentication**:
   ```
   User → /fitness/settings/garmin → POST /api/fitness/garmin/auth
   → GarminClient.login() → OAuth tokens → Encrypted → athlete_profile.garmin_tokens
   ```

2. **Manual Sync**:
   ```
   User clicks "Sync Now" → POST /api/fitness/garmin/sync
   → Load tokens from DB → GarminSyncService.syncAll(7)
   → Fetch daily metrics → Upsert body_metrics
   → Fetch activities → Match to planned_workouts → Insert workout_logs/cardio_logs
   → Update garmin_last_sync timestamp
   ```

3. **Deduplication**:
   - Daily metrics: Unique constraint on `(user_id, metric_date)` = upsert overwrites
   - Activities: Check `garmin_activity_id` before insert, skip if exists

## What Gets Synced

### Daily Metrics → `body_metrics` table
- Resting HR (RHR)
- HRV (heart rate variability)
- Body Battery (0-100 energy score)
- Sleep score
- Sleep duration (total, deep, REM, awake)
- Stress average
- VO2 max (when available)

### Activities → `workout_logs` + `cardio_logs` tables
- Activity type (running, cycling, strength, etc.)
- Duration, distance, calories
- Average/max HR
- HR zones (time in each zone)
- Power metrics (for cycling)
- Training effect scores

### Activity Matching
- Automatically matches Garmin activities to planned workouts by:
  - Date (activity start_date = planned scheduled_date)
  - Type (Garmin running → planned cardio)
  - Compatible types (HIIT ↔ cardio)
- Sets `planned_workout_id` if matched
- Confidence levels: high, medium, low

## Security

- **Token Encryption**: AES-256-GCM before database storage
- **HTTPS Only**: All Garmin requests use HTTPS
- **RLS Policies**: Users can only see their own credentials
- **No Password Storage**: Only encrypted OAuth tokens stored
- **Rate Limiting**: 1s delay between API requests

## Troubleshooting

### "Invalid Garmin credentials"
- Double-check email/password
- Try logging into connect.garmin.com directly
- If MFA is enabled, disable it temporarily (MFA support not yet implemented)

### "Failed to sync"
- Check Garmin Connect is accessible
- Check network connection
- View `garmin_sync_logs` table for detailed error messages

### "Token expired"
- Tokens should last ~1 month
- If expired, reconnect Garmin account

### No data synced
- Ensure you have data in Garmin Connect for the date range
- Check `garmin_sync_logs` for error messages
- Manually verify data exists on connect.garmin.com

## Future Enhancements

- **Auto-sync via Cron**: Daily automatic sync (Vercel Cron)
- **MFA Support**: Handle multi-factor authentication
- **Webhook Integration**: Real-time updates (if Garmin adds support)
- **More Granular Activity Data**: Laps, splits, power curves
- **Sync Settings**: Choose which metrics to sync

## Technical Details

### Dependencies
- `undici` - Modern HTTP client for Node.js
- `tough-cookie` - Cookie jar for session management

### Key Files
- `src/lib/fitness/garmin-client.ts` - Core client (420 lines)
- `src/lib/fitness/garmin-sync-service.ts` - Sync orchestration (270 lines)
- `src/lib/fitness/garmin-tokens.ts` - Encryption utilities (90 lines)
- `src/app/api/fitness/garmin/*` - 3 API routes (~150 lines total)
- `supabase/migrations/20260226000000_garmin_integration.sql` - Schema

### Endpoints Used
```
POST https://sso.garmin.com/sso/signin
GET  https://connect.garmin.com/usersummary-service/usersummary/daily/{user}
GET  https://connect.garmin.com/hrv-service/hrv/{date}
GET  https://connect.garmin.com/wellness-service/wellness/bodyBattery/events/{date}
GET  https://connect.garmin.com/wellness-service/wellness/dailySleepData/{user}
GET  https://connect.garmin.com/activitylist-service/activities/search/activities
GET  https://connect.garmin.com/activity-service/activity/{activityId}
GET  https://connect.garmin.com/activity-service/activity/{activityId}/hrTimeInZones
```

## Support

If you encounter issues:
1. Check `garmin_sync_logs` table for error messages
2. Verify ENCRYPT_KEY is set in `.env.local`
3. Ensure database migration was applied
4. Test authentication on connect.garmin.com directly
5. Check browser console for client-side errors
