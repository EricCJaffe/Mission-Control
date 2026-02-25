// ============================================================
// TDEE ESTIMATION (Total Daily Energy Expenditure)
// Combines: BMR + activity level + workout calories
// Uses Mifflin-St Jeor equation (most accurate for adults)
// ============================================================

/**
 * Mifflin-St Jeor BMR
 * Male: 10 × weight(kg) + 6.25 × height(cm) - 5 × age - 161 + 166
 *   (the +166 vs -161 accounts for male vs female)
 * For male: BMR = 10 × weight(kg) + 6.25 × height(cm) - 5 × age + 5
 */
export function calculateBMR(params: {
  weight_lbs: number;
  height_inches: number;
  age_years: number;
  sex: 'male' | 'female';
}): number {
  const weightKg = params.weight_lbs * 0.453592;
  const heightCm = params.height_inches * 2.54;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * params.age_years;
  return Math.round(params.sex === 'male' ? base + 5 : base - 161);
}

/**
 * Activity multiplier based on Garmin daily data + workout load
 * Sedentary = 1.2, Light = 1.375, Moderate = 1.55, Active = 1.725, Very Active = 1.9
 */
function activityMultiplier(params: {
  steps: number;
  active_minutes: number;
  workout_tss: number;
}): number {
  const { steps, active_minutes, workout_tss } = params;

  // Step-based baseline
  let base = 1.2;
  if (steps >= 12000) base = 1.55;
  else if (steps >= 8000) base = 1.45;
  else if (steps >= 5000) base = 1.375;

  // Workout adjustment: TSS 50 ≈ +0.1, TSS 100 ≈ +0.2
  const workoutAdj = Math.min(0.35, (workout_tss / 100) * 0.2);

  // Active minutes bonus
  const activeAdj = Math.min(0.15, (active_minutes / 120) * 0.1);

  return Math.min(2.0, base + workoutAdj + activeAdj);
}

/**
 * Estimate TDEE for a given day
 */
export function estimateTDEE(params: {
  weight_lbs: number;
  height_inches?: number;   // default 71 (5'11")
  age_years?: number;        // default 55
  sex?: 'male' | 'female';
  steps?: number;
  active_minutes?: number;
  workout_tss?: number;
}): {
  bmr: number;
  multiplier: number;
  tdee: number;
  maintenance_range: [number, number];
} {
  const bmr = calculateBMR({
    weight_lbs: params.weight_lbs,
    height_inches: params.height_inches ?? 71,
    age_years: params.age_years ?? 55,
    sex: params.sex ?? 'male',
  });

  const multiplier = activityMultiplier({
    steps: params.steps ?? 5000,
    active_minutes: params.active_minutes ?? 30,
    workout_tss: params.workout_tss ?? 0,
  });

  const tdee = Math.round(bmr * multiplier);

  // Maintenance range: ±200 calories
  return {
    bmr,
    multiplier: Math.round(multiplier * 100) / 100,
    tdee,
    maintenance_range: [tdee - 200, tdee + 200],
  };
}

/**
 * Estimate weekly TDEE from 7 days of data (more accurate)
 */
export function estimateWeeklyTDEE(
  dailyData: { weight_lbs: number; steps: number; active_minutes: number; workout_tss: number }[],
  profileDefaults?: { height_inches: number; age_years: number; sex: 'male' | 'female' },
): { daily_avg: number; weekly_total: number } {
  if (dailyData.length === 0) return { daily_avg: 0, weekly_total: 0 };

  const totals = dailyData.map((d) =>
    estimateTDEE({ ...d, ...profileDefaults }).tdee,
  );

  const weekly = totals.reduce((a, b) => a + b, 0);
  return {
    daily_avg: Math.round(weekly / dailyData.length),
    weekly_total: weekly,
  };
}
