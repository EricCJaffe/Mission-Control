import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { parseWorkoutDescription, findExerciseSuggestions } from '@/lib/fitness/ai';
import type { Exercise, WorkoutStructureItem } from '@/lib/fitness/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ParseWorkoutRequest = {
  description: string;
  mode?: 'append' | 'replace';
};

type ParseWorkoutResponse = {
  ok: boolean;
  structure: WorkoutStructureItem[];
  unmatched_exercises: string[];
  suggestions: Array<{
    input: string;
    suggestions: Array<{ id: string; name: string; category: string; similarity: number }>;
  }>;
  error?: string;
};

export async function POST(request: NextRequest): Promise<NextResponse<ParseWorkoutResponse>> {
  try {
    const supabase = await supabaseServer();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { ok: false, structure: [], unmatched_exercises: [], suggestions: [], error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json() as ParseWorkoutRequest;
    console.log('[API] Received body:', JSON.stringify(body));
    const { description } = body;
    console.log('[API] Extracted description:', description);

    if (!description?.trim()) {
      return NextResponse.json(
        { ok: false, structure: [], unmatched_exercises: [], suggestions: [], error: 'Description is required' },
        { status: 400 }
      );
    }

    // Fetch exercise library (template exercises + user's custom exercises)
    const { data: exercises, error: exError } = await supabase
      .from('exercises')
      .select('id, name, category, muscle_groups')
      .or(`user_id.eq.${user.id},is_template.eq.true`)
      .order('name');

    if (exError) {
      console.error('Error fetching exercises:', exError);
      return NextResponse.json(
        { ok: false, structure: [], unmatched_exercises: [], suggestions: [], error: 'Failed to fetch exercise library' },
        { status: 500 }
      );
    }

    const exerciseLibrary = exercises ?? [];

    // Optionally fetch recent body metrics for AI context
    const { data: metricsData } = await supabase
      .from('body_metrics')
      .select('*')
      .eq('user_id', user.id)
      .order('metric_date', { ascending: false })
      .limit(1)
      .single();

    // Parse workout description using AI
    const { structure, unmatched_exercises } = await parseWorkoutDescription({
      description,
      exerciseLibrary,
      metrics: metricsData ?? undefined,
    });

    // For each unmatched exercise, find fuzzy matches
    const suggestions = unmatched_exercises.map((unmatchedName) => ({
      input: unmatchedName,
      suggestions: findExerciseSuggestions(unmatchedName, exerciseLibrary, 3),
    }));

    // Hydrate exercise data in the structure
    const hydratedStructure: WorkoutStructureItem[] = structure.map((item) => {
      if (item.type === 'standalone') {
        const exercise = exerciseLibrary.find((ex) => ex.id === item.exercise_id);
        return {
          ...item,
          exercise: exercise ? (exercise as Exercise) : undefined,
        };
      } else {
        // Superset
        const hydratedExercises = item.exercises.map((ex) => {
          const exercise = exerciseLibrary.find((e) => e.id === ex.exercise_id);
          return {
            ...ex,
            exercise: exercise ? (exercise as Exercise) : undefined,
          };
        });
        return {
          ...item,
          exercises: hydratedExercises,
        };
      }
    });

    return NextResponse.json({
      ok: true,
      structure: hydratedStructure,
      unmatched_exercises,
      suggestions,
    });
  } catch (error) {
    console.error('Error parsing workout:', error);
    return NextResponse.json(
      {
        ok: false,
        structure: [],
        unmatched_exercises: [],
        suggestions: [],
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
