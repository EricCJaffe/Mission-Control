export type HydrationTarget = {
  base_target_oz: number;
  min_target_oz: number;
  max_target_oz: number;
  workout_adjustment_per_hour_oz: number;
  heat_adjustment_oz: number;
  alert_weight_gain_lbs: number;
};

export function calculateHydrationTarget(params: {
  defaults: HydrationTarget;
  workoutMinutes?: number | null;
  sweatLevel?: string | null;
  weatherHeat?: boolean;
}) {
  const workoutHours = Math.max((params.workoutMinutes || 0) / 60, 0);
  const sweatMultiplier = params.sweatLevel === 'high' ? 1.25 : params.sweatLevel === 'low' ? 0.85 : 1;
  const workoutAdjustment = Math.round(params.defaults.workout_adjustment_per_hour_oz * workoutHours * sweatMultiplier);
  const heatAdjustment = params.weatherHeat ? params.defaults.heat_adjustment_oz : 0;
  const target = params.defaults.base_target_oz + workoutAdjustment + heatAdjustment;
  return Math.max(params.defaults.min_target_oz, Math.min(params.defaults.max_target_oz, target));
}

export function summarizeHydrationRisk(params: {
  todayIntakeOz: number;
  todayOutputOz: number;
  targetOz: number;
  latestWeightLbs: number | null;
  baselineWeightLbs: number | null;
  alertWeightGainLbs: number;
}) {
  const netBalanceOz = Math.round((params.todayIntakeOz - params.todayOutputOz) * 10) / 10;
  const deficitOz = Math.max(0, params.targetOz - params.todayIntakeOz);
  const weightGain =
    params.latestWeightLbs != null && params.baselineWeightLbs != null
      ? params.latestWeightLbs - params.baselineWeightLbs
      : null;

  return {
    netBalanceOz,
    deficitOz,
    weightGainLbs: weightGain,
    weightGainAlert: weightGain != null && weightGain >= params.alertWeightGainLbs,
    overloadRisk: weightGain != null && weightGain >= params.alertWeightGainLbs && netBalanceOz > 24,
    dehydrationRisk: deficitOz >= 24 && netBalanceOz < 8,
  };
}

export function hydrationTrendSeries(logs: Array<Record<string, unknown>>) {
  return logs.map((row) => ({
    date: String(row.log_date || ''),
    intake_oz: Number(row.intake_oz || 0),
    output_oz: Number(row.output_oz || 0),
    net_balance_oz: Number(row.net_balance_oz || 0),
  }));
}
