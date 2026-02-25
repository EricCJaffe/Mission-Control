// ============================================================
// FITNESS MODULE — Shared TypeScript Types
// ============================================================

export type WorkoutType = 'strength' | 'cardio' | 'hiit' | 'hybrid';
export type SetType = 'warmup' | 'working' | 'cooldown' | 'drop' | 'failure' | 'amrap';
export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'core' | 'cardio' | 'mobility';
export type ComplianceColor = 'green' | 'yellow' | 'orange' | 'red';
export type FormStatus = 'fresh' | 'optimal' | 'fatigued' | 'overreaching' | 'critical';
export type BPFlagLevel = 'normal' | 'elevated' | 'high_stage1' | 'high_stage2' | 'crisis';
export type InsightPriority = 'info' | 'positive' | 'warning' | 'critical';

export type HRZones = {
  z1: [number, number];
  z2: [number, number];
  z3: [number, number];
  z4: [number, number];
};

export type Exercise = {
  id: string;
  user_id: string | null;
  name: string;
  category: ExerciseCategory;
  equipment: string | null;
  muscle_groups: string[];
  is_compound: boolean;
  notes: string | null;
  is_template: boolean;
  created_at: string;
};

export type SetTarget = {
  type: SetType;
  target_reps?: number;
  target_weight?: number;
};

export type StandaloneExercise = {
  type: 'standalone';
  exercise_id: string;
  exercise?: Exercise;
  sets: SetTarget[];
  notes?: string;
};

export type SupersetExercise = {
  exercise_id: string;
  exercise?: Exercise;
  target_reps: number;
  target_weight?: number;
};

export type SupersetGroup = {
  type: 'superset';
  group_name: string;
  rounds: number;
  exercises: SupersetExercise[];
  rest_between_exercises: number;
  rest_between_rounds: number;
};

export type WorkoutStructureItem = StandaloneExercise | SupersetGroup;

export type WorkoutTemplate = {
  id: string;
  user_id: string;
  name: string;
  type: WorkoutType;
  split_type: string | null;
  structure: WorkoutStructureItem[];
  estimated_duration_min: number | null;
  ai_generated: boolean;
  notes: string | null;
  created_at: string;
};

export type SetLog = {
  id?: string;
  exercise_id: string | null;
  set_number: number;
  set_type: SetType;
  reps: number | null;
  weight_lbs: number | null;
  rpe: number | null;
  rest_seconds: number | null;
  superset_group: string | null;
  superset_round: number | null;
  is_pr: boolean;
  notes: string | null;
};

export type CardioLog = {
  activity_type: string;
  avg_hr: number | null;
  max_hr: number | null;
  min_hr: number | null;
  time_in_zone1_min: number | null;
  time_in_zone2_min: number | null;
  time_in_zone3_min: number | null;
  time_in_zone4_min: number | null;
  distance_miles: number | null;
  avg_pace_per_mile: string | null;
  calories: number | null;
  hr_recovery_1min: number | null;
  hr_recovery_2min: number | null;
  z2_drift_duration_min: number | null;
  cardiac_drift_pct: number | null;
  avg_power_watts: number | null;
  max_power_watts: number | null;
  normalized_power: number | null;
  cardiac_efficiency: number | null;
  cardiac_cost: number | null;
  efficiency_type: 'running' | 'cycling' | null;
  weather_data: WeatherSnapshot | null;
};

export type WorkoutSource = 'manual' | 'garmin' | 'imported';

export type WorkoutLog = {
  id: string;
  user_id: string;
  planned_workout_id: string | null;
  template_id: string | null;
  workout_date: string;
  workout_type: WorkoutType;
  duration_minutes: number | null;
  tss: number | null;
  compliance_pct: number | null;
  compliance_color: ComplianceColor | null;
  rpe_session: number | null;
  notes: string | null;
  ai_summary: string | null;
  garmin_activity_id: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  garmin_data: Record<string, unknown> | null;
  source: WorkoutSource;
  strain_score: number | null;
};

export type BodyMetrics = {
  id: string;
  user_id: string;
  metric_date: string;
  resting_hr: number | null;
  hrv_ms: number | null;
  body_battery: number | null;
  sleep_score: number | null;
  sleep_duration_min: number | null;
  sleep_stages: Record<string, number> | null;
  stress_avg: number | null;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  training_readiness: number | null;
  vo2_max: number | null;
  meds_taken_at: string | null;
};

export type BPReading = {
  id: string;
  user_id: string;
  reading_date: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  position: string;
  arm: string;
  time_of_day: string | null;
  pre_or_post_meds: string | null;
  pre_or_post_workout: string | null;
  flag_level: BPFlagLevel;
  notes: string | null;
};

export type FitnessForm = {
  calc_date: string;
  daily_tss: number;
  fitness_ctl: number | null;
  fatigue_atl: number | null;
  form_tsb: number | null;
  form_status: FormStatus | null;
  ramp_rate_7d: number | null;
};

export type WeatherSnapshot = {
  temp_f: number;
  feels_like_f: number;
  humidity: number;
  uv_index: number | null;
  conditions: string;
  wind_mph: number;
  heat_index_f: number;
  zone_adjustment_bpm: number;
};

export type PersonalRecord = {
  id: string;
  exercise_id: string | null;
  record_type: string;
  value: number;
  unit: string | null;
  achieved_date: string;
};

export type AIInsight = {
  id: string;
  insight_date: string;
  insight_type: string;
  title: string;
  content: string;
  priority: InsightPriority;
  acknowledged: boolean;
};

export type Equipment = {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  purchase_date: string | null;
  max_distance_miles: number | null;
  total_distance_miles: number;
  status: 'active' | 'retired' | 'maintenance';
};

export type PlannedWorkoutStatus = 'pending' | 'completed' | 'skipped' | 'substituted';

export type PlannedWorkout = {
  id: string;
  scheduled_date: string;
  week_number: number | null;
  day_label: string | null;
  workout_type: string | null;
  prescribed: Record<string, unknown>;
  template_id: string | null;
  status: PlannedWorkoutStatus;
};

// ============================================================
// ADVANCED METRICS — Readiness, Strain, Efficiency, etc.
// ============================================================

export type ReadinessColor = 'green' | 'yellow' | 'red';
export type ReadinessLabel = 'Primed' | 'Moderate' | 'Recovery';
export type StrainLevel = 'light' | 'moderate' | 'high' | 'all_out';
export type BalanceStatus = 'undertrained' | 'balanced' | 'stretched' | 'overreached';
export type SleepDebtStatus = 'surplus' | 'balanced' | 'mild_debt' | 'significant_debt' | 'critical_debt';
export type PlanPhase = 'build' | 'deload' | 'peak' | 'base';
export type LabType =
  | 'bloodwork' | 'lipid_panel' | 'cbc' | 'cmp' | 'thyroid' | 'a1c'
  | 'cardiac_markers' | 'imaging' | 'stress_test' | 'ecg' | 'echo' | 'other';

export type ReadinessFactor = {
  name: string;
  score: number;
  weight: number;
  weighted_contribution: number;
  detail: string;
};

export type ReadinessInputs = {
  hrv_status: number;
  hrv_7day_baseline: number;
  resting_hr: number;
  rhr_baseline: number;
  sleep_score: number;
  sleep_duration_min: number;
  sleep_target_min: number;
  body_battery: number;
  stress_avg_overnight: number;
  training_readiness: number;
  form_tsb: number;
  latest_bp_systolic: number | null;
  latest_bp_diastolic: number | null;
  bp_7day_avg_systolic: number;
  heat_index_f: number | null;
  outdoor_planned: boolean;
};

export type ReadinessResult = {
  score: number;
  color: ReadinessColor;
  label: ReadinessLabel;
  factors: ReadinessFactor[];
  recommendation: string;
};

export type StrainInputs = {
  workouts: {
    type: WorkoutType;
    duration_min: number;
    avg_hr: number | null;
    max_hr: number | null;
    time_in_zone_min: { z1: number; z2: number; z3: number; z4: number } | null;
    avg_power_watts: number | null;
    tss: number | null;
    session_rpe: number | null;
    total_volume_lbs: number | null;
  }[];
  all_day_stress_avg: number;
  steps: number;
  active_minutes: number;
  max_hr: number;
  lactate_threshold_hr: number;
  beta_blocker_multiplier: number;
};

export type StrainResult = {
  strain: number;
  level: StrainLevel;
  breakdown: {
    workout_strain: number;
    daily_life_strain: number;
  };
};

export type BalanceResult = {
  balance_pct: number;
  status: BalanceStatus;
  remaining_capacity_pct: number;
  message: string;
};

export type SleepDebt = {
  target_min: number;
  rolling_7day_balance_min: number;
  rolling_14day_balance_min: number;
  status: SleepDebtStatus;
  impact_on_readiness: number;
};

export type CardiacEfficiencyResult = {
  efficiency: number;
  type: 'running' | 'cycling';
  cardiac_cost: number;
  unit: string;
};

export type RecoveryPrediction = {
  estimated_recovery_hours: number;
  ready_by: Date;
  ready_for_next_session: boolean;
  confidence: 'high' | 'medium' | 'low';
  message: string;
};

export type WeeklyBudget = {
  weekly_tss_budget: number;
  daily_avg_target: number;
  spent_this_week: number;
  remaining: number;
  pace_status: 'behind' | 'on_pace' | 'ahead' | 'over_budget';
};

export type Estimated1RM = {
  exercise_id: string;
  exercise_name: string;
  estimated_1rm_lbs: number;
  based_on_weight: number;
  based_on_reps: number;
  date: string;
};

export type PowerZones = {
  ftp: number;
  z1: [number, number]; // Active Recovery: 0-55% FTP
  z2: [number, number]; // Endurance: 56-75% FTP
  z3: [number, number]; // Tempo: 76-90% FTP
  z4: [number, number]; // Threshold: 91-105% FTP
  z5: [number, number]; // VO2max: 106-120% FTP
  z6: [number, number]; // Anaerobic: 121-150% FTP
};

export type AthleteProfile = {
  id: string;
  user_id: string;
  max_hr_ceiling: number;
  lactate_threshold_hr: number;
  ftp_watts: number | null;
  hr_zones: HRZones;
  power_zones: PowerZones | null;
  sleep_target_min: number;
  beta_blocker_multiplier: number;
  medications: { name: string; dose: string; frequency: string }[];
  meds_schedule: Record<string, string> | null;
  rhr_baseline: number | null;
  hrv_baseline: number | null;
  weight_goal_lbs: number | null;
  rhr_goal: number | null;
};

export type LabResult = {
  id: string;
  user_id: string;
  lab_date: string;
  lab_type: LabType;
  provider: string | null;
  file_url: string | null;
  file_name: string | null;
  raw_text: string | null;
  parsed_results: Record<string, unknown> | null;
  ai_analysis: string | null;
  ai_flags: { flag: string; severity: 'info' | 'warning' | 'critical' }[] | null;
  notes: string | null;
};

export type MorningBriefing = {
  date: string;
  readiness: ReadinessResult;
  overnight: {
    resting_hr: number | null;
    rhr_vs_baseline: number | null;
    hrv_ms: number | null;
    hrv_vs_baseline: number | null;
    sleep_score: number | null;
    sleep_duration_min: number | null;
    sleep_debt: SleepDebt;
    body_battery: number | null;
  };
  today_plan: PlannedWorkout | null;
  weather: WeatherSnapshot | null;
  weekly: {
    strain_budget_pct: number;
    compliance_fraction: string;
    streak_days: number;
  };
  alerts: { title: string; message: string; icon: string }[];
};
