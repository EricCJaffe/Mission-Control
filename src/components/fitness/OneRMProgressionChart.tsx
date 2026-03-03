'use client';

import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';

type PRRecord = {
  id: string;
  exercise_id: string | null;
  exercise_name: string | null;
  record_type: string;
  value: number;
  unit: string | null;
  achieved_date: string;
};

type Props = {
  records: PRRecord[];
};

const LINE_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
  '#db2777', '#0891b2', '#65a30d',
];

export default function OneRMProgressionChart({ records }: Props) {
  // Group records by exercise for exercises that have estimated_1rm or max_weight records
  const exerciseData = useMemo(() => {
    const byExercise = new Map<string, PRRecord[]>();

    records
      .filter(r => r.exercise_name && (r.record_type === 'estimated_1rm' || r.record_type === 'max_weight'))
      .forEach(r => {
        const key = r.exercise_name!;
        if (!byExercise.has(key)) byExercise.set(key, []);
        byExercise.get(key)!.push(r);
      });

    // Only include exercises with 2+ data points (need at least 2 for a line)
    const result: { name: string; records: PRRecord[] }[] = [];
    byExercise.forEach((recs, name) => {
      if (recs.length >= 2) {
        result.push({
          name,
          records: recs.sort((a, b) => new Date(a.achieved_date).getTime() - new Date(b.achieved_date).getTime()),
        });
      }
    });

    return result;
  }, [records]);

  const [selectedExercises, setSelectedExercises] = useState<Set<string>>(() =>
    new Set(exerciseData.slice(0, 4).map(e => e.name))
  );

  // Build chart data: merge all dates into a single timeline
  const chartData = useMemo(() => {
    const dateMap = new Map<string, Record<string, number>>();

    exerciseData
      .filter(e => selectedExercises.has(e.name))
      .forEach(exercise => {
        exercise.records.forEach(r => {
          const dateKey = r.achieved_date;
          if (!dateMap.has(dateKey)) dateMap.set(dateKey, {});
          dateMap.get(dateKey)![exercise.name] = r.value;
        });
      });

    return Array.from(dateMap.entries())
      .map(([date, values]) => ({
        date,
        dateLabel: new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        ...values,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [exerciseData, selectedExercises]);

  if (exerciseData.length === 0) return null;

  const toggleExercise = (name: string) => {
    setSelectedExercises(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-700">1RM Progression</h2>
      </div>

      {/* Exercise filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {exerciseData.map((exercise, i) => (
          <button
            key={exercise.name}
            onClick={() => toggleExercise(exercise.name)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors min-h-[28px] ${
              selectedExercises.has(exercise.name)
                ? 'text-white'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
            style={selectedExercises.has(exercise.name) ? { backgroundColor: LINE_COLORS[i % LINE_COLORS.length] } : {}}
          >
            {exercise.name} ({exercise.records.length})
          </button>
        ))}
      </div>

      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              tickLine={false}
              label={{ value: 'lbs', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }}
            />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: 12 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {exerciseData
              .filter(e => selectedExercises.has(e.name))
              .map((exercise) => (
                <Line
                  key={exercise.name}
                  type="monotone"
                  dataKey={exercise.name}
                  stroke={LINE_COLORS[exerciseData.indexOf(exercise) % LINE_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  connectNulls
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="text-xs text-slate-400 text-center py-8">Select exercises above to view progression.</p>
      )}
    </div>
  );
}
