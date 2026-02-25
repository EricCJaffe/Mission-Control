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
  z2_drift_duration_min: number | null;
  cardiac_drift_pct: number | null;
  avg_power_watts: number | null;
  max_power_watts: number | null;
  normalized_power: number | null;
  weather_data: WeatherSnapshot | null;
};

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
};

export type BodyMetrics = {
  id: string;
  user_id: string;
  metric_date: string;
  resting_hr: number | null;
  hrv_ms: number | null;
  body_battery: number | null;
  sleep_score: number | null;
  weight_lbs: number | null;
  body_fat_pct: number | null;
  training_readiness: number | null;
  vo2_max: number | null;
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

export type PlannedWorkout = {
  id: string;
  scheduled_date: string;
  week_number: number | null;
  day_label: string | null;
  workout_type: string | null;
  prescribed: Record<string, unknown>;
  template_id: string | null;
};
