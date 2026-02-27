import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { buildAISystemPrompt } from '@/lib/fitness/health-context';
import { callOpenAI } from '@/lib/openai';

export const dynamic = 'force-dynamic';

/**
 * POST /api/fitness/plans/generate
 *
 * Generate an AI-powered training plan based on:
 * - Historical workout data (past 90 days)
 * - Personal records and progression patterns
 * - Compliance and recovery patterns
 * - Current readiness and form (TSB)
 * - Goals and preferences
 */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      goal, // 'strength', 'endurance', 'hybrid', 'maintenance'
      weeks = 8,
      sessions_per_week = 4,
      focus_areas = [], // ['upper', 'lower', 'cardio']
    } = body;

    if (!goal) {
      return NextResponse.json({ error: 'Goal is required' }, { status: 400 });
    }

    // Fetch historical workout data (last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: workoutLogs } = await supabase
      .from('workout_logs')
      .select(`
        id,
        workout_date,
        workout_type,
        duration_minutes,
        tss,
        rpe_session,
        compliance_pct,
        strain_score,
        avg_hr,
        template_id
      `)
      .eq('user_id', user.id)
      .gte('workout_date', ninetyDaysAgo.toISOString())
      .order('workout_date', { ascending: false });

    // Fetch exercise history with sets
    const { data: setLogs } = await supabase
      .from('set_logs')
      .select(`
        exercise_id,
        set_type,
        reps,
        weight_lbs,
        rpe,
        workout_logs!inner(workout_date)
      `)
      .eq('workout_logs.user_id', user.id)
      .gte('workout_logs.workout_date', ninetyDaysAgo.toISOString())
      .order('workout_logs.workout_date', { ascending: false });

    // Fetch exercises (to get names and categories)
    const { data: exercises } = await supabase
      .from('exercises')
      .select('id, name, category, muscle_groups, is_compound, equipment');

    // Build exercise frequency map
    const exerciseFrequency = new Map<string, number>();
    const exerciseMaxWeight = new Map<string, number>();

    if (setLogs) {
      for (const set of setLogs) {
        const count = exerciseFrequency.get(set.exercise_id) || 0;
        exerciseFrequency.set(set.exercise_id, count + 1);

        if (set.weight_lbs) {
          const currentMax = exerciseMaxWeight.get(set.exercise_id) || 0;
          if (set.weight_lbs > currentMax) {
            exerciseMaxWeight.set(set.exercise_id, set.weight_lbs);
          }
        }
      }
    }

    // Get top exercises by frequency
    const topExercises = Array.from(exerciseFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([exerciseId]) => {
        const ex = exercises?.find(e => e.id === exerciseId);
        const maxWeight = exerciseMaxWeight.get(exerciseId);
        return {
          id: exerciseId,
          name: ex?.name || 'Unknown',
          category: ex?.category || 'unknown',
          muscle_groups: ex?.muscle_groups || [],
          frequency: exerciseFrequency.get(exerciseId),
          max_weight: maxWeight,
        };
      });

    // Fetch personal records (last 90 days)
    const { data: recentPRs } = await supabase
      .from('personal_records')
      .select('exercise_id, record_type, value, unit, achieved_date, notes')
      .eq('user_id', user.id)
      .gte('achieved_date', ninetyDaysAgo.toISOString().slice(0, 10))
      .order('achieved_date', { ascending: false })
      .limit(20);

    // Fetch current readiness and form
    const { data: readiness } = await supabase
      .from('daily_readiness')
      .select('readiness_score, readiness_label, recommendation')
      .eq('user_id', user.id)
      .order('calc_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: form } = await supabase
      .from('fitness_form')
      .select('form_tsb, form_status, fitness_ctl, fatigue_atl')
      .eq('user_id', user.id)
      .order('calc_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Calculate workout statistics
    const workoutStats = {
      total_workouts: workoutLogs?.length || 0,
      avg_sessions_per_week: workoutLogs ? (workoutLogs.length / 13) : 0, // 90 days ≈ 13 weeks
      workout_type_distribution: {} as Record<string, number>,
      avg_duration: 0,
      avg_tss: 0,
      avg_compliance: 0,
    };

    if (workoutLogs && workoutLogs.length > 0) {
      for (const log of workoutLogs) {
        workoutStats.workout_type_distribution[log.workout_type] =
          (workoutStats.workout_type_distribution[log.workout_type] || 0) + 1;
      }

      workoutStats.avg_duration =
        workoutLogs.reduce((sum, log) => sum + (log.duration_minutes || 0), 0) / workoutLogs.length;
      workoutStats.avg_tss =
        workoutLogs.reduce((sum, log) => sum + (log.tss || 0), 0) / workoutLogs.length;

      const logsWithCompliance = workoutLogs.filter(log => log.compliance_pct !== null);
      if (logsWithCompliance.length > 0) {
        workoutStats.avg_compliance =
          logsWithCompliance.reduce((sum, log) => sum + (log.compliance_pct || 0), 0) / logsWithCompliance.length;
      }
    }

    // Build AI system prompt with health context
    const systemPrompt = await buildAISystemPrompt(user.id, 'plan_generation');

    const userPrompt = `Generate a ${weeks}-week training plan optimized for my goal: ${goal}.

TARGET: ${sessions_per_week} sessions per week
${focus_areas.length > 0 ? `FOCUS AREAS: ${focus_areas.join(', ')}` : ''}

HISTORICAL DATA (last 90 days):
- Total workouts: ${workoutStats.total_workouts}
- Avg per week: ${workoutStats.avg_sessions_per_week.toFixed(1)} sessions
- Workout types: ${Object.entries(workoutStats.workout_type_distribution).map(([type, count]) => `${type} (${count})`).join(', ')}
- Avg duration: ${workoutStats.avg_duration.toFixed(0)} min
- Avg TSS: ${workoutStats.avg_tss.toFixed(0)}
- Compliance: ${workoutStats.avg_compliance.toFixed(0)}%

TOP EXERCISES (by frequency):
${topExercises.slice(0, 10).map(ex =>
  `- ${ex.name} (${ex.category}): ${ex.frequency} sets${ex.max_weight ? `, max ${ex.max_weight}lbs` : ''}`
).join('\n')}

RECENT PRs:
${recentPRs && recentPRs.length > 0
  ? recentPRs.slice(0, 5).map(pr => {
      const ex = exercises?.find(e => e.id === pr.exercise_id);
      return `- ${ex?.name || 'Unknown'}: ${pr.value}${pr.unit} (${pr.record_type})`;
    }).join('\n')
  : 'No recent PRs'}

CURRENT STATUS:
- Readiness: ${readiness ? `${readiness.readiness_score}/100 (${readiness.readiness_label})` : 'Unknown'}
- Form (TSB): ${form ? `${Math.round(form.form_tsb)} (${form.form_status})` : 'Unknown'}
- CTL: ${form?.fitness_ctl || '?'}, ATL: ${form?.fatigue_atl || '?'}

REQUIREMENTS:
1. Use my proven exercises (top 10-15 from history)
2. Progressive overload based on my current max weights
3. Periodization: Base → Build → Peak phases
4. Honor my medication timing and cardiac constraints (see health context)
5. Include deload weeks (every 3-4 weeks)
6. Balance with readiness/recovery patterns
7. Account for current form (TSB status)

Return a JSON training plan with this structure:
{
  "plan_name": "Descriptive plan name",
  "goal": "${goal}",
  "weeks": ${weeks},
  "phases": [
    {
      "phase_name": "Base Building",
      "weeks": [1, 2, 3],
      "focus": "volume, technique",
      "intensity_pct": 70
    }
  ],
  "weekly_template": [
    {
      "day_number": 1,
      "day_label": "e.g., Upper Push",
      "workout_type": "strength",
      "target_duration_min": 60,
      "target_tss": 45,
      "exercises": [
        {
          "exercise_id": "uuid-from-top-exercises",
          "exercise_name": "Bench Press",
          "sets": 4,
          "target_reps": "8-10",
          "target_weight_pct": 75,
          "rest_seconds": 120,
          "notes": "Build from 75% of max"
        }
      ]
    }
  ],
  "progression_notes": "How to progress each week",
  "deload_weeks": [4, 8]
}

Use only exercises from my history. Return ONLY valid JSON.`;

    const result = await callOpenAI({
      model: 'gpt-4o',
      system: systemPrompt,
      user: userPrompt,
    });

    let planData;
    try {
      planData = JSON.parse(result);
    } catch (parseError) {
      console.error('Failed to parse AI plan response:', result);
      return NextResponse.json({ error: 'AI returned invalid plan format' }, { status: 500 });
    }

    // Save the generated plan to database
    const { data: savedPlan, error: savePlanError } = await supabase
      .from('training_plans')
      .insert({
        user_id: user.id,
        plan_name: planData.plan_name,
        goal: planData.goal,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date(Date.now() + weeks * 7 * 86400000).toISOString().slice(0, 10),
        weekly_structure: planData.weekly_template,
        config: {
          phases: planData.phases,
          deload_weeks: planData.deload_weeks,
          progression_notes: planData.progression_notes,
        },
        status: 'draft',
        ai_generated: true,
      })
      .select()
      .single();

    if (savePlanError) {
      console.error('Error saving generated plan:', savePlanError);
      return NextResponse.json({ error: savePlanError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      plan: savedPlan,
      plan_data: planData,
    });
  } catch (error) {
    console.error('Error generating training plan:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate plan' },
      { status: 500 }
    );
  }
}
