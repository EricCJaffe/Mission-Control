// ============================================================
// WEEKLY STRESS BUDGET
// Financial-budget metaphor for training stress
// Based on CTL from PMC — sustainable weekly TSS load
// ============================================================

import type { WeeklyBudget, PlanPhase } from './types';

/**
 * Calculate weekly TSS budget from current fitness level and plan phase
 */
export function calculateWeeklyBudget(params: {
  current_ctl: number;
  current_tsb: number;
  plan_phase: PlanPhase;
  week_of_block: number;  // 1-4 in a mesocycle
}): WeeklyBudget {
  const { current_ctl, current_tsb, plan_phase, week_of_block } = params;

  // Base budget = CTL × 7 (maintain current fitness)
  let budget = current_ctl * 7;

  // Phase adjustments
  switch (plan_phase) {
    case 'build':
      // Progressive overload: +5% per week in the block
      budget *= 1 + week_of_block * 0.05;
      break;
    case 'deload':
      budget *= 0.65; // 35% reduction
      break;
    case 'peak':
      budget *= 0.80; // 20% reduction
      break;
    case 'base':
      // Steady state
      break;
  }

  // Form adjustment: if already fatigued, reduce budget
  if (current_tsb < -15) budget *= 0.85;

  // Minimum budget floor (don't go below 100 TSS/week for active training)
  budget = Math.max(budget, 100);

  return {
    weekly_tss_budget: Math.round(budget),
    daily_avg_target: Math.round(budget / 7),
    spent_this_week: 0, // caller fills this in from actual workout_logs
    remaining: Math.round(budget),
    pace_status: 'on_pace',
  };
}

/**
 * Update budget with actual spending and determine pace
 */
export function updateBudgetPace(budget: WeeklyBudget, params: {
  spent_this_week: number;
  days_elapsed: number;  // 1-7 (Monday = 1)
}): WeeklyBudget {
  const { spent_this_week, days_elapsed } = params;
  const remaining = budget.weekly_tss_budget - spent_this_week;
  const spentRatio = spent_this_week / budget.weekly_tss_budget;
  const timeRatio = days_elapsed / 7;

  let pace_status: WeeklyBudget['pace_status'];
  if (spentRatio > 1.1) pace_status = 'over_budget';
  else if (spentRatio > timeRatio * 1.15) pace_status = 'ahead';
  else if (spentRatio < timeRatio * 0.7) pace_status = 'behind';
  else pace_status = 'on_pace';

  return {
    ...budget,
    spent_this_week,
    remaining: Math.max(0, remaining),
    pace_status,
  };
}

/**
 * Format budget for display
 */
export function formatBudget(budget: WeeklyBudget): {
  text: string;
  color: string;
  pct_used: number;
} {
  const pct = Math.round((budget.spent_this_week / budget.weekly_tss_budget) * 100);
  const colorMap = {
    behind: 'blue',
    on_pace: 'green',
    ahead: 'yellow',
    over_budget: 'red',
  };

  return {
    text: `${budget.spent_this_week} / ${budget.weekly_tss_budget} TSS (${pct}%)`,
    color: colorMap[budget.pace_status],
    pct_used: pct,
  };
}
