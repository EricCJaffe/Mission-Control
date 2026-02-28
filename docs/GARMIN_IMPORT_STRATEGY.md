# Garmin Connect Historical Data Import Strategy

## Executive Summary

Garmin Connect export contains 3.7MB+ of comprehensive fitness data including:
- ~150+ historical workouts with full metrics
- Blood pressure readings (direct match to our BP tracking!)
- Sleep data, body metrics, nutrition logs
- Training load, readiness scores, endurance metrics
- Equipment/gear tracking with activity associations
- Personal records across multiple disciplines

**Goal**: Import this historical data to seed our database and extend our schema where beneficial, without overwriting existing manual entries.

---

## 1. Data Source Analysis

### Priority 1: Direct Schema Matches (Import Ready)

#### Blood Pressure Data
**File**: `DI-Connect-Wellness/BloodPressureFile_2025-01-01_2026-01-01.json`

**Sample Structure**:
```json
{
  "version": 1754225936458,
  "metaData": {
    "userProfilePK": 104034066,
    "calendarDate": [2025, 8, 3, 8, 58, 46, 6000000],
    "sequence": 1754225936458
  },
  "bloodPressure": {
    "systolic": 107,
    "diastolic": 70,
    "pulse": 81,
    "multiMeasurement": false
  },
  "biometricSourceType": 2
}
```

**Mapping to `blood_pressure_readings`**:
- `calendarDate` → `measured_at` (parse array to timestamp)
- `bloodPressure.systolic` → `systolic`
- `bloodPressure.diastolic` → `diastolic`
- `bloodPressure.pulse` → `pulse` (add column if missing)
- `biometricSourceType: 2` → `source: 'Garmin Index'`
- Set `notes: 'Imported from Garmin Connect'`

**Deduplication**: Check for existing readings within ±2 minutes of timestamp

---

#### Workout Activities
**File**: `DI-Connect-Fitness/ejaffejax@gmail.com_0_summarizedActivities.json`

**Sample Structure**:
```json
{
  "activityId": 21993142932,
  "name": "Clay County Running",
  "activityType": "running",
  "beginTimestamp": 1772115185000,
  "sportType": "RUNNING",
  "duration": 3386583.0078125, // milliseconds
  "distance": 577502.001953125, // meters
  "elevationGain": 2400.0, // meters
  "elevationLoss": 2100.0,
  "avgSpeed": 0.17050000429153445, // m/s
  "maxSpeed": 0.22300000190734864,
  "avgHr": 126.0,
  "maxHr": 140.0,
  "minHr": 92.0,
  "avgPower": 186.0,
  "maxPower": 303.0,
  "avgRunCadence": 72.0, // double steps/min
  "steps": 8176.0,
  "calories": 1692.7680799999998,
  "aerobicTrainingEffect": 2.799999952316284,
  "anaerobicTrainingEffect": 0.0,
  "vO2MaxValue": 39.0,
  "avgVerticalOscillation": 6.590000152587891, // cm
  "avgGroundContactTime": 332.79998779296875, // ms
  "avgStrideLength": 70.27999877929688, // cm
  "avgVerticalRatio": 9.369999885559082, // %
  "avgDoubleCadence": 145.171875,
  "normPower": 203.0
}
```

**Mapping to `workout_logs` + `cardio_logs`**:

**workout_logs**:
- `activityId` → `external_id` (new column, indexed)
- `beginTimestamp` → `start_time`
- `duration / 1000` → `duration_seconds`
- `name` → `session_notes`
- `sportType` → map to `workout_type`:
  - RUNNING → 'cardio'
  - CYCLING → 'cardio'
  - STRENGTH_TRAINING → 'strength'
  - etc.
- `calories` → `calories_burned`
- `avgHr` → `avg_hr`
- `maxHr` → `max_hr`
- `minHr` → `min_hr`
- `aerobicTrainingEffect` → `training_effect` (new column)
- `source: 'Garmin Import'`

**cardio_logs**:
- Map `activityType` to `activity_type`:
  - "running" → "Running"
  - "cycling" → "Biking"
  - "swimming" → "Swimming"
- `distance / 1609.34` → `distance_miles`
- Calculate `avg_pace_per_mile` from duration/distance for running
- `avgSpeed * 2.23694` → `avg_speed_mph` (for biking)
- `elevationGain * 3.28084` → `elevation_gain_ft`
- `avgPower` → `avg_watts` (new column for cycling)
- `normPower` → `normalized_power` (new column for cycling)
- `avgRunCadence * 2` → `cadence` (convert double cadence to steps/min)
- `avgVerticalOscillation` → `vertical_oscillation_cm` (new column)
- `avgGroundContactTime` → `ground_contact_time_ms` (new column)
- `avgStrideLength` → `stride_length_cm` (new column)
- `avgVerticalRatio` → `vertical_ratio_pct` (new column)

**Deduplication**: Check for existing workouts within ±5 minutes of `beginTimestamp`

---

#### Personal Records
**File**: `DI-Connect-Fitness/ejaffejax@gmail.com_personalRecord.json`

**Sample Structure**:
```json
{
  "personalRecordId": 2800921786,
  "activityId": 21144885786,
  "value": 47810.0,
  "prStartTimeGMT": "Tue Nov 25 15:12:58 GMT 2025",
  "personalRecordType": "Farthest Run",
  "createdDate": "2025-12-01",
  "current": true,
  "confirmed": true
}
```

**Mapping to `personal_records`**:
- Map `personalRecordType` to our `record_type`:
  - "Best 1km Run" → "Best 1km Run"
  - "Best 5km Run" → "Best 5km Run"
  - "Best 10km Run" → "Best 10km Run"
  - "Farthest Run" → "Longest Run"
  - "Farthest Cycle" → "Longest Ride"
  - "Max Elevation Gain" → "Max Elevation Gain"
  - "Max Avg Power (20 min)" → "Best 20min Power"
- `value` → convert based on type (meters to miles, seconds to HH:MM:SS)
- `prStartTimeGMT` → `achieved_at`
- `activityId` → link to imported workout via `external_id`
- Only import if `current: true && confirmed: true`

**Deduplication**: Update existing record only if Garmin value is better

---

#### Equipment/Gear
**File**: `DI-Connect-Fitness/ejaffejax@gmail.com_gear.json`

**Sample Structure**:
```json
{
  "gearPk": 44700764,
  "uuid": "f5292a2743d14d7b9f5b30174191566c",
  "gearTypeName": "Shoes",
  "gearStatusName": "active",
  "customMakeModel": "Brooks",
  "dateBegin": "2025-07-25",
  "maximumMeters": 643737.6
}
```

**Mapping to `equipment`**:
- Map `gearTypeName` to `equipment_type`:
  - "Shoes" → "Running Shoes"
  - "Bike" → "Bike"
- `customMakeModel` → `name`
- `dateBegin` → `purchase_date`
- `maximumMeters / 1609.34` → `mileage_alert_miles`
- `gearStatusName: "active"` → `status: "active"`
- `gearStatusName: "retired"` → `status: "retired"`
- `uuid` → `external_id` (new column for linking)

**Gear Activity Associations**:
Link imported workouts to equipment using `gearActivityDTOs` mapping

**Deduplication**: Match by name + type, merge if found

---

### Priority 2: Schema Extensions (High Value)

#### Body Metrics / Weight Tracking
**File**: `DI-Connect-Wellness/104034066_userBioMetrics.json`

**Sample Structure**:
```json
{
  "metaData": {
    "calendarDate": "2025-07-18T00:00:00.0"
  },
  "weight": {
    "weight": 81419.0, // grams
    "sourceType": "MFP",
    "timestampGMT": "2025-07-18T18:01:21.0"
  },
  "height": 172.72000122070312 // cm
}
```

**New Table**: `body_metrics` (extends existing `body_metrics` table or creates if missing)
```sql
create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null,
  weight_kg numeric(5,2),
  weight_lbs numeric(5,2),
  height_cm numeric(5,2),
  body_fat_pct numeric(4,2),
  muscle_mass_kg numeric(5,2),
  bone_mass_kg numeric(4,2),
  body_water_pct numeric(4,2),
  source text default 'manual',
  notes text,
  created_at timestamptz default now()
);
```

**Mapping**:
- `weight.weight / 1000` → `weight_kg`
- Calculate `weight_lbs` from kg
- `height` → `height_cm`
- `weight.sourceType` → `source` (MFP, Garmin, manual)
- `timestampGMT` → `measured_at`

---

#### Sleep Tracking
**Files**: `DI-Connect-Wellness/*_sleepData.json` (3 files, ~100+ nights)

**Sample Structure**:
```json
{
  "dailySleepDTO": {
    "id": 1763787600000,
    "userProfilePK": 104034066,
    "calendarDate": "2025-11-20",
    "sleepTimeSeconds": 24060,
    "napTimeSeconds": 0,
    "sleepStartTimestampGMT": 1763794800000,
    "sleepEndTimestampGMT": 1763818860000,
    "sleepStartTimestampLocal": 1763776800000,
    "sleepEndTimestampLocal": 1763800860000,
    "unmeasurableSleepSeconds": 0,
    "deepSleepSeconds": 7620,
    "lightSleepSeconds": 13980,
    "remSleepSeconds": 2460,
    "awakeSleepSeconds": 0,
    "avgSleepStress": 20.0,
    "avgOverallHrvValue": 51.0,
    "hrvStatus": "BALANCED",
    "restingHeartRate": 67,
    "bodyBatteryChange": 87,
    "avgRespiration": 15.5
  }
}
```

**New Table**: `sleep_logs`
```sql
create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sleep_date date not null,
  sleep_start timestamptz not null,
  sleep_end timestamptz not null,
  total_sleep_seconds integer not null,
  deep_sleep_seconds integer,
  light_sleep_seconds integer,
  rem_sleep_seconds integer,
  awake_seconds integer,
  sleep_score integer,
  avg_hrv numeric(5,1),
  hrv_status text,
  resting_hr integer,
  avg_stress numeric(4,1),
  avg_respiration numeric(4,1),
  body_battery_change integer,
  source text default 'Garmin',
  created_at timestamptz default now(),
  unique(user_id, sleep_date)
);
```

**Mapping**: Direct field mapping as shown in table structure

---

#### Training Load / PMC Enhancement
**Files**:
- `DI-Connect-Metrics/MetricsAcuteTrainingLoad_*.json`
- `DI-Connect-Metrics/TrainingHistory_*.json`

**Sample Structure**:
```json
{
  "userProfilePK": 104034066,
  "calendarDate": "2025-11-03",
  "acuteTrainingLoad": 15.9,
  "chronicTrainingLoad": 28.3,
  "trainingLoadRatio": 0.562,
  "trainingStatus": "RECOVERY"
}
```

**Schema Extension**: Add to existing `pmc_history` table
```sql
alter table public.pmc_history
  add column if not exists garmin_atl numeric(5,1),
  add column if not exists garmin_ctl numeric(5,1),
  add column if not exists training_load_ratio numeric(4,3),
  add column if not exists training_status text;
```

**Mapping**: Backfill historical PMC data from Garmin's calculations

---

#### Training Readiness
**Files**: `DI-Connect-Metrics/TrainingReadinessDTO_*.json`

**Sample Structure**:
```json
{
  "calendarDate": "2025-11-02",
  "level": "HIGH",
  "score": 94,
  "sleepScoreFactorPercent": 0,
  "recoveryTime": 1,
  "recoveryTimeFactorPercent": 99,
  "acwrFactorPercent": 100,
  "hrvFactorPercent": 0,
  "hrvWeeklyAverage": 511.0,
  "acuteLoad": 0
}
```

**Integration**: Enhance existing `readiness_scores` table
```sql
alter table public.readiness_scores
  add column if not exists garmin_readiness_score integer,
  add column if not exists readiness_level text,
  add column if not exists recovery_time_hrs integer,
  add column if not exists acwr_factor_pct integer,
  add column if not exists hrv_factor_pct integer,
  add column if not exists hrv_weekly_avg numeric(5,1);
```

---

#### Daily Summary (Steps, Stress, Calories)
**Files**: `DI-Connect-Aggregator/UDSFile_*.json`

**Sample Structure**:
```json
{
  "calendarDate": "2025-11-19",
  "totalSteps": 6807,
  "dailyStepGoal": 9810,
  "totalKilocalories": 2209.0,
  "bmrKilocalories": 1975.0,
  "activeKilocalories": 234.0,
  "restingHeartRate": 69,
  "minHeartRate": 63,
  "maxHeartRate": 110,
  "floorsAscendedInMeters": 0.0,
  "allDayStress": {
    "averageStressLevel": 30,
    "maxStressLevel": 82,
    "stressDuration": 38160,
    "restDuration": 34500
  }
}
```

**New Table**: `daily_summaries`
```sql
create table if not exists public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_date date not null,
  total_steps integer,
  step_goal integer,
  total_calories integer,
  bmr_calories integer,
  active_calories integer,
  resting_hr integer,
  min_hr integer,
  max_hr integer,
  floors_climbed integer,
  avg_stress integer,
  max_stress integer,
  stress_duration_mins integer,
  rest_duration_mins integer,
  source text default 'Garmin',
  created_at timestamptz default now(),
  unique(user_id, summary_date)
);
```

---

### Priority 3: Advanced Metrics (Optional Enhancement)

#### Running-Specific Metrics
**Files**:
- `DI-Connect-Metrics/RunningTolerance_*.json`
- `DI-Connect-Metrics/RunRacePredictions_*.json`

Import as JSON metadata in workout logs or create dedicated `running_metrics` table

#### Cycling-Specific Metrics
**Files**:
- `DI-Connect-Metrics/CyclingAbility_*.json`
- `DI-Connect-Wellness/104034066_powerZones.json`

Import power zones to athlete profile, cycling ability as metadata

#### Endurance Score & VO2 Max History
**Files**: `DI-Connect-Metrics/EnduranceScore_*.json`

Track historical VO2 Max trends

---

## 2. Import Strategy

### Phase 1: Schema Preparation (Migration)

**Migration**: `supabase/migrations/20260228200000_garmin_import_schema.sql`

```sql
-- Add external_id to workout_logs for Garmin activity tracking
alter table public.workout_logs
  add column if not exists external_id text,
  add column if not exists training_effect numeric(3,2);

create index if not exists workout_logs_external_id_idx
  on public.workout_logs(external_id) where external_id is not null;

-- Add Garmin-specific cardio fields
alter table public.cardio_logs
  add column if not exists avg_watts numeric(5,1),
  add column if not exists normalized_power numeric(5,1),
  add column if not exists vertical_oscillation_cm numeric(4,2),
  add column if not exists ground_contact_time_ms numeric(5,1),
  add column if not exists stride_length_cm numeric(5,1),
  add column if not exists vertical_ratio_pct numeric(4,2);

-- Add pulse to blood pressure
alter table public.blood_pressure_readings
  add column if not exists pulse integer;

-- Add external_id to equipment
alter table public.equipment
  add column if not exists external_id text;

-- Create body_metrics table
create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null,
  weight_kg numeric(5,2),
  weight_lbs numeric(5,2),
  height_cm numeric(5,2),
  body_fat_pct numeric(4,2),
  muscle_mass_kg numeric(5,2),
  bone_mass_kg numeric(4,2),
  body_water_pct numeric(4,2),
  source text default 'manual',
  notes text,
  created_at timestamptz default now()
);

create index body_metrics_user_date_idx
  on public.body_metrics(user_id, measured_at desc);

alter table public.body_metrics enable row level security;

create policy "body_metrics_owner" on public.body_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create sleep_logs table
create table if not exists public.sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sleep_date date not null,
  sleep_start timestamptz not null,
  sleep_end timestamptz not null,
  total_sleep_seconds integer not null,
  deep_sleep_seconds integer,
  light_sleep_seconds integer,
  rem_sleep_seconds integer,
  awake_seconds integer,
  sleep_score integer,
  avg_hrv numeric(5,1),
  hrv_status text,
  resting_hr integer,
  avg_stress numeric(4,1),
  avg_respiration numeric(4,1),
  body_battery_change integer,
  source text default 'Garmin',
  created_at timestamptz default now(),
  unique(user_id, sleep_date)
);

create index sleep_logs_user_date_idx
  on public.sleep_logs(user_id, sleep_date desc);

alter table public.sleep_logs enable row level security;

create policy "sleep_logs_owner" on public.sleep_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Create daily_summaries table
create table if not exists public.daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  summary_date date not null,
  total_steps integer,
  step_goal integer,
  total_calories integer,
  bmr_calories integer,
  active_calories integer,
  resting_hr integer,
  min_hr integer,
  max_hr integer,
  floors_climbed integer,
  avg_stress integer,
  max_stress integer,
  stress_duration_mins integer,
  rest_duration_mins integer,
  source text default 'Garmin',
  created_at timestamptz default now(),
  unique(user_id, summary_date)
);

create index daily_summaries_user_date_idx
  on public.daily_summaries(user_id, summary_date desc);

alter table public.daily_summaries enable row level security;

create policy "daily_summaries_owner" on public.daily_summaries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Enhance PMC history with Garmin data
alter table public.pmc_history
  add column if not exists garmin_atl numeric(5,1),
  add column if not exists garmin_ctl numeric(5,1),
  add column if not exists training_load_ratio numeric(4,3),
  add column if not exists training_status text;

-- Enhance readiness scores with Garmin data
alter table public.readiness_scores
  add column if not exists garmin_readiness_score integer,
  add column if not exists readiness_level text,
  add column if not exists recovery_time_hrs integer,
  add column if not exists acwr_factor_pct integer,
  add column if not exists hrv_factor_pct integer,
  add column if not exists hrv_weekly_avg numeric(5,1);

-- Comments
comment on column workout_logs.external_id is 'External system ID (e.g., Garmin activityId)';
comment on column workout_logs.training_effect is 'Aerobic Training Effect (0-5 scale)';
comment on table body_metrics is 'Historical body composition tracking';
comment on table sleep_logs is 'Nightly sleep tracking and analysis';
comment on table daily_summaries is 'Daily activity summaries (steps, stress, calories)';
```

---

### Phase 2: Import Processor

**New Library**: `src/lib/fitness/garmin-import.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

export type ImportProgress = {
  phase: string;
  current: number;
  total: number;
  status: 'processing' | 'complete' | 'error';
  message?: string;
};

export class GarminImporter {
  private supabase: any;
  private userId: string;
  private progressCallback?: (progress: ImportProgress) => void;

  constructor(userId: string, progressCallback?: (progress: ImportProgress) => void) {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    this.userId = userId;
    this.progressCallback = progressCallback;
  }

  async importAll(exportPath: string) {
    const phases = [
      { name: 'Blood Pressure', fn: this.importBloodPressure },
      { name: 'Body Metrics', fn: this.importBodyMetrics },
      { name: 'Sleep Data', fn: this.importSleepData },
      { name: 'Daily Summaries', fn: this.importDailySummaries },
      { name: 'Equipment', fn: this.importEquipment },
      { name: 'Workouts', fn: this.importWorkouts },
      { name: 'Personal Records', fn: this.importPersonalRecords },
      { name: 'Training Load', fn: this.importTrainingLoad },
      { name: 'Readiness', fn: this.importReadiness },
    ];

    for (const phase of phases) {
      await phase.fn.call(this, exportPath);
    }
  }

  private async importBloodPressure(exportPath: string) {
    // Implementation details...
  }

  // ... other import methods
}
```

---

### Phase 3: API Endpoints

**New Route**: `src/app/api/fitness/garmin/import-history/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { GarminImporter } from '@/lib/fitness/garmin-import';

export async function POST(request: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { exportPath } = await request.json();

  const importer = new GarminImporter(user.id, (progress) => {
    // Send progress via SSE or polling endpoint
  });

  try {
    await importer.importAll(exportPath);
    return NextResponse.json({ ok: true, message: 'Import complete' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

---

### Phase 4: UI Component

**New Component**: `src/components/fitness/GarminImportWizard.tsx`

Features:
- File/folder selection
- Import options checkboxes (select what to import)
- Progress bar with phase-by-phase status
- Conflict review/resolution UI
- Summary of imported records

---

## 3. Deduplication Strategy

### Blood Pressure
- Match within ±2 minutes of timestamp
- If found: skip (prefer manual entry)
- If not: insert with `source: 'Garmin Import'`

### Workouts
- Match by `start_time` within ±5 minutes
- If found: update `external_id` field, skip full import
- If not: full import with all metrics

### Equipment
- Match by `name` + `equipment_type`
- If found: update `external_id`, merge mileage if Garmin higher
- If not: insert new

### Personal Records
- Match by `record_type` + `exercise_id`
- Update only if Garmin value is better (faster time, longer distance, etc.)

### Body Metrics / Sleep / Daily Summaries
- Use `unique(user_id, date)` constraint
- Insert with `ON CONFLICT DO NOTHING` to preserve existing

---

## 4. Implementation Timeline

### Week 1: Foundation
- **Day 1-2**: Run schema migration, test on dev
- **Day 3-4**: Build `GarminImporter` class core logic
- **Day 5**: Test BP + Equipment import (simplest)

### Week 2: Core Import
- **Day 1-2**: Workouts + Cardio logs import
- **Day 3**: Body metrics + Sleep import
- **Day 4**: Daily summaries import
- **Day 5**: Testing and deduplication verification

### Week 3: Enhancement
- **Day 1-2**: Personal Records import
- **Day 3**: Training Load / PMC backfill
- **Day 4**: Readiness scores backfill
- **Day 5**: UI wizard component

### Week 4: Polish
- **Day 1-2**: Error handling, rollback logic
- **Day 3**: Progress tracking, UI refinement
- **Day 4**: Documentation
- **Day 5**: Production deployment

---

## 5. Benefits & Value

### Immediate Value
1. **Historical Context**: ~150+ workouts populate trends, charts, analytics
2. **Blood Pressure History**: Real BP data from Garmin Index scale
3. **Equipment Mileage**: Accurate shoe/bike mileage from day 1
4. **Personal Records**: Automatically populated PRs for all disciplines

### Medium-Term Value
1. **Sleep Analysis**: Full sleep history for recovery insights
2. **Training Load**: Historical ATL/CTL for PMC accuracy
3. **Body Composition**: Weight trends over 6+ months
4. **Daily Activity**: Steps, stress, resting HR trends

### Long-Term Value
1. **Predictive Analytics**: More data = better AI insights
2. **Trend Analysis**: Year-over-year comparisons
3. **Health Document**: Rich historical data for health.md auto-updates
4. **Correlation Analysis**: Sleep vs performance, stress vs readiness, etc.

---

## 6. Risk Mitigation

### Data Integrity
- ✅ Deduplication prevents double-counting
- ✅ External IDs preserve import provenance
- ✅ Manual entries never overwritten
- ✅ Rollback via transaction IDs

### Performance
- ✅ Batch inserts (100 records/batch)
- ✅ Progress tracking prevents timeout
- ✅ Async import with status polling
- ✅ Indexes on external_id fields

### User Experience
- ✅ Preview import before commit
- ✅ Conflict resolution UI
- ✅ Selective import (checkboxes)
- ✅ Clear progress indication

---

## 7. Next Steps

1. **Review Strategy**: User approval of this plan
2. **Run Migration**: Apply schema changes
3. **Build Importer**: Implement GarminImporter class
4. **Test Import**: Dry run on sample data
5. **Full Import**: Execute on complete Garmin export
6. **Verify Data**: Check dashboard, trends, analytics
7. **Document**: Update CLAUDE.md with new features

---

## Appendix: File Inventory

```
DI_CONNECT/
├── DI-Connect-Fitness/
│   ├── summarizedActivities.json (3.7MB, ~150+ workouts)
│   ├── personalRecord.json (~50 PRs)
│   ├── gear.json (5 equipment items)
│   ├── workout.json (planned workouts)
│   └── trainingPlan.json
├── DI-Connect-Wellness/
│   ├── BloodPressureFile_2025-01-01_2026-01-01.json
│   ├── userBioMetrics.json (weight/height history)
│   ├── sleepData.json (3 files, ~100+ nights)
│   ├── healthStatusData.json
│   ├── nutritionLogs.json
│   ├── heartRateZones.json
│   └── powerZones.json
├── DI-Connect-Metrics/
│   ├── TrainingHistory_*.json (3 files)
│   ├── TrainingReadinessDTO_*.json (3 files)
│   ├── EnduranceScore_*.json (3 files)
│   ├── CyclingAbility_*.json (3 files)
│   ├── RunningTolerance_*.json (3 files)
│   └── MetricsAcuteTrainingLoad_*.json (3 files)
└── DI-Connect-Aggregator/
    ├── UDSFile_*.json (3 files, daily summaries)
    └── HydrationLogFile_*.json (3 files)
```

**Total Estimated Import Volume**:
- ~150 workouts
- ~100 sleep nights
- ~200 daily summaries
- ~50 personal records
- ~50 BP readings
- ~100 body metric entries
- ~200 training load entries
- ~200 readiness scores

**Total**: ~1000+ database records

---

**Status**: Ready for implementation pending user approval
**Estimated Effort**: 3-4 weeks full implementation
**Risk Level**: Low (non-destructive import with deduplication)
**Value**: High (massive historical data enrichment)
