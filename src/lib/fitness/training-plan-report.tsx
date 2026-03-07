import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export interface TrainingPlanReportData {
  planName: string;
  planType: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  goal: string | null;
  executiveSummary: string | null;
  primaryObjective: string | null;
  secondaryObjectives: string[];
  targetMetrics: Array<{
    metric?: string;
    current?: string;
    target?: string;
    why?: string;
  }>;
  weeklyFramework: Array<{
    day_name?: string;
    session_type?: string;
    purpose?: string;
    duration_min?: number;
    notes?: string;
  }>;
  dayTypeGuidance: Array<{
    type?: string;
    description?: string;
    intensity_guidance?: string;
    duration_guidance?: string;
    examples?: string[];
  }>;
  progressionNotes: string | null;
  phases: Array<{
    phase_name?: string;
    weeks?: number[];
    focus?: string;
    intensity_pct?: number;
  }>;
  weeklyTemplate: Array<{
    day_number?: number;
    day_label?: string;
    workout_type?: string;
    target_duration_min?: number;
    target_tss?: number;
    exercises?: Array<{
      exercise_name?: string;
      sets?: number;
      target_reps?: string;
      target_weight_pct?: number;
      rest_seconds?: number;
      notes?: string;
    }>;
  }>;
}

const styles = StyleSheet.create({
  page: { padding: 38, fontFamily: 'Helvetica', fontSize: 10, color: '#1e293b' },
  header: { marginBottom: 18, borderBottomWidth: 2, borderBottomColor: '#1d4ed8', paddingBottom: 10 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#1d4ed8' },
  subtitle: { fontSize: 11, color: '#475569', marginTop: 4 },
  meta: { fontSize: 8, color: '#64748b', marginTop: 6 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 7, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  paragraph: { fontSize: 9.5, lineHeight: 1.5, color: '#334155' },
  row: { flexDirection: 'row', marginBottom: 4 },
  label: { width: 110, fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#475569' },
  value: { flex: 1, fontSize: 9.5, color: '#1e293b' },
  card: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, padding: 8, marginBottom: 8, backgroundColor: '#f8fafc' },
  cardTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 4 },
  bullet: { flexDirection: 'row', marginBottom: 3 },
  bulletDot: { width: 8, fontSize: 10, color: '#1d4ed8' },
  bulletText: { flex: 1, fontSize: 9, color: '#334155', lineHeight: 1.45 },
  exerciseRow: { marginTop: 4, paddingLeft: 8 },
  exerciseName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  exerciseMeta: { fontSize: 8, color: '#475569', marginTop: 1 },
  footer: { position: 'absolute', bottom: 24, left: 38, right: 38, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 6 },
  footerText: { fontSize: 7, color: '#94a3b8' },
});

export function TrainingPlanReport({ data }: { data: TrainingPlanReportData }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Training Plan Report</Text>
          <Text style={styles.subtitle}>{data.planName}</Text>
          <Text style={styles.meta}>Generated: {data.generatedAt} | Mission Control Training Planning</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan Overview</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Plan Type</Text>
            <Text style={styles.value}>{data.planType}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Goal</Text>
            <Text style={styles.value}>{data.goal || data.planType}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Start Date</Text>
            <Text style={styles.value}>{data.startDate}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>End Date</Text>
            <Text style={styles.value}>{data.endDate}</Text>
          </View>
          {data.progressionNotes && (
            <Text style={[styles.paragraph, { marginTop: 8 }]}>{data.progressionNotes}</Text>
          )}
        </View>

        {data.executiveSummary && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            <Text style={styles.paragraph}>{data.executiveSummary}</Text>
          </View>
        )}

        {data.targetMetrics.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Target Metrics</Text>
            {data.targetMetrics.map((metric, index) => (
              <View key={`${metric.metric}-${index}`} style={styles.card}>
                <Text style={styles.cardTitle}>{metric.metric || `Metric ${index + 1}`}</Text>
                <Text style={styles.paragraph}>Current: {metric.current || '—'} | Target: {metric.target || '—'}</Text>
                {metric.why ? <Text style={[styles.paragraph, { marginTop: 4 }]}>{metric.why}</Text> : null}
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Phases</Text>
          {data.phases.length === 0 ? (
            <Text style={styles.paragraph}>No phase breakdown saved.</Text>
          ) : (
            data.phases.map((phase, index) => (
              <View key={`${phase.phase_name}-${index}`} style={styles.card}>
                <Text style={styles.cardTitle}>{phase.phase_name || `Phase ${index + 1}`}</Text>
                <Text style={styles.paragraph}>
                  {phase.focus || 'General progression focus'}
                  {phase.weeks && phase.weeks.length > 0 ? ` | Weeks: ${phase.weeks.join(', ')}` : ''}
                  {phase.intensity_pct ? ` | Intensity: ${phase.intensity_pct}%` : ''}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Mission Control</Text>
          <Text style={styles.footerText}>Training Plan Overview</Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={[styles.title, { fontSize: 18 }]}>Weekly Template</Text>
          <Text style={styles.meta}>{data.planName}</Text>
        </View>

        {data.weeklyTemplate.map((day, index) => (
          <View key={`${day.day_label}-${index}`} style={styles.card}>
            <Text style={styles.cardTitle}>
              Day {day.day_number || index + 1}: {day.day_label || day.workout_type || 'Workout'}
            </Text>
            <Text style={styles.paragraph}>
              Type: {day.workout_type || 'mixed'}
              {day.target_duration_min ? ` | Duration: ${day.target_duration_min} min` : ''}
              {day.target_tss ? ` | TSS: ${day.target_tss}` : ''}
            </Text>
            {Array.isArray(day.exercises) && day.exercises.length > 0 ? (
              day.exercises.map((exercise, exIndex) => (
                <View key={`${exercise.exercise_name}-${exIndex}`} style={styles.exerciseRow}>
                  <Text style={styles.exerciseName}>{exercise.exercise_name || `Exercise ${exIndex + 1}`}</Text>
                  <Text style={styles.exerciseMeta}>
                    {exercise.sets ? `${exercise.sets} sets` : ''}
                    {exercise.target_reps ? ` | Reps: ${exercise.target_reps}` : ''}
                    {exercise.target_weight_pct ? ` | Load: ${exercise.target_weight_pct}%` : ''}
                    {exercise.rest_seconds ? ` | Rest: ${exercise.rest_seconds}s` : ''}
                  </Text>
                  {exercise.notes ? <Text style={styles.exerciseMeta}>{exercise.notes}</Text> : null}
                </View>
              ))
            ) : (
              <View style={{ marginTop: 6 }}>
                <View style={styles.bullet}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.bulletText}>No exercise list saved for this day. Use the day label and notes as the template.</Text>
                </View>
              </View>
            )}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Mission Control</Text>
          <Text style={styles.footerText}>Weekly Template</Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={[styles.title, { fontSize: 18 }]}>Framework and Day Guidance</Text>
          <Text style={styles.meta}>{data.planName}</Text>
        </View>

        {data.weeklyFramework.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Weekly Framework</Text>
            {data.weeklyFramework.map((day, index) => (
              <View key={`${day.day_name}-${index}`} style={styles.card}>
                <Text style={styles.cardTitle}>{day.day_name || `Day ${index + 1}`} - {day.session_type || 'Session'}</Text>
                {day.purpose ? <Text style={styles.paragraph}>{day.purpose}</Text> : null}
                <Text style={[styles.paragraph, { marginTop: 4 }]}>
                  Duration: {day.duration_min || '—'} min
                  {day.notes ? ` | ${day.notes}` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {data.dayTypeGuidance.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Day-Type Guidance</Text>
            {data.dayTypeGuidance.map((dayType, index) => (
              <View key={`${dayType.type}-${index}`} style={styles.card}>
                <Text style={styles.cardTitle}>{dayType.type || `Type ${index + 1}`}</Text>
                {dayType.description ? <Text style={styles.paragraph}>{dayType.description}</Text> : null}
                {dayType.intensity_guidance ? <Text style={[styles.paragraph, { marginTop: 4 }]}>Intensity: {dayType.intensity_guidance}</Text> : null}
                {dayType.duration_guidance ? <Text style={styles.paragraph}>Duration: {dayType.duration_guidance}</Text> : null}
                {dayType.examples && dayType.examples.length > 0 ? <Text style={styles.paragraph}>Examples: {dayType.examples.join(', ')}</Text> : null}
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Mission Control</Text>
          <Text style={styles.footerText}>Framework and Guidance</Text>
        </View>
      </Page>
    </Document>
  );
}
