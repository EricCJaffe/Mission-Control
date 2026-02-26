import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { SuggestedQuestion, ChangeSinceLastVisit } from './types';

// ============================================================
// CARDIOLOGIST REPORT PDF — For appointment prep
// ============================================================

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1e293b' },
  header: { marginBottom: 20, borderBottomWidth: 2, borderBottomColor: '#1e40af', paddingBottom: 12 },
  headerTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#1e40af' },
  headerSubtitle: { fontSize: 11, color: '#64748b', marginTop: 4 },
  headerMeta: { fontSize: 9, color: '#94a3b8', marginTop: 8 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#1e40af', marginBottom: 8, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  subsectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#334155', marginBottom: 4, marginTop: 8 },
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 140, fontSize: 9, color: '#64748b', fontFamily: 'Helvetica-Bold' },
  value: { flex: 1, fontSize: 10 },
  flagBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, fontSize: 8, color: '#92400e', marginBottom: 4, alignSelf: 'flex-start' },
  questionBlock: { marginBottom: 8, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#dbeafe' },
  questionPriority: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 2 },
  questionText: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#1e293b', marginBottom: 2 },
  questionContext: { fontSize: 9, color: '#64748b' },
  questionData: { fontSize: 9, color: '#475569', fontStyle: 'italic', marginTop: 1 },
  changeRow: { flexDirection: 'row', marginBottom: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  changeMetric: { width: 120, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  changePrev: { width: 80, fontSize: 9, color: '#94a3b8' },
  changeCurrent: { width: 80, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  changeTrend: { width: 60, fontSize: 8, textAlign: 'center' },
  changeNote: { flex: 1, fontSize: 8, color: '#64748b' },
  medRow: { flexDirection: 'row', marginBottom: 4, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  medName: { width: 150, fontSize: 9, fontFamily: 'Helvetica-Bold' },
  medDose: { width: 80, fontSize: 9 },
  medFreq: { width: 80, fontSize: 9 },
  medPurpose: { flex: 1, fontSize: 8, color: '#64748b' },
  flagItem: { flexDirection: 'row', marginBottom: 4, paddingLeft: 8 },
  flagDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f59e0b', marginRight: 6, marginTop: 3 },
  flagText: { flex: 1, fontSize: 9 },
  notesArea: { marginTop: 8, minHeight: 80, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, padding: 8 },
  notesLabel: { fontSize: 8, color: '#94a3b8', marginBottom: 4 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 },
  footerText: { fontSize: 7, color: '#94a3b8' },
});

const PRIORITY_COLORS: Record<string, string> = {
  high: '#dc2626',
  medium: '#d97706',
  low: '#059669',
};

const TREND_LABELS: Record<string, string> = {
  improved: 'Improved',
  worsened: 'Worsened',
  stable: 'Stable',
};

const TREND_COLORS: Record<string, string> = {
  improved: '#059669',
  worsened: '#dc2626',
  stable: '#64748b',
};

export interface CardiologistReportData {
  patientName: string;
  appointmentDate: string;
  doctorName: string;
  doctorSpecialty: string;
  suggestedQuestions: SuggestedQuestion[];
  changesSummary: ChangeSinceLastVisit[];
  flags: string[];
  medications: Array<{
    name: string;
    type: string;
    dosage: string | null;
    frequency: string | null;
    purpose: string | null;
  }>;
  vitals: {
    rhr: number | null;
    hrv: number | null;
    bp: { systolic: number; diastolic: number } | null;
    weight: number | null;
    bodyBattery: number | null;
    sleepHours: number | null;
  };
  generatedAt: string;
}

export function CardiologistReport({ data }: { data: CardiologistReportData }) {
  const prescriptions = data.medications.filter(m => m.type === 'prescription');
  const supplements = data.medications.filter(m => m.type !== 'prescription');

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Cardiologist Appointment Prep</Text>
          <Text style={styles.headerSubtitle}>
            {data.patientName} — {data.doctorName} ({data.doctorSpecialty})
          </Text>
          <Text style={styles.headerMeta}>
            Appointment: {data.appointmentDate} | Generated: {data.generatedAt} | Mission Control Health Intelligence
          </Text>
        </View>

        {/* Flags / Alerts */}
        {data.flags.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Proactive Flags</Text>
            {data.flags.map((flag, i) => (
              <View key={i} style={styles.flagItem}>
                <View style={styles.flagDot} />
                <Text style={styles.flagText}>{flag}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Current Vitals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Vitals (7-Day Average)</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Resting Heart Rate:</Text>
            <Text style={styles.value}>{data.vitals.rhr ? `${data.vitals.rhr} bpm` : 'No data'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Heart Rate Variability:</Text>
            <Text style={styles.value}>{data.vitals.hrv ? `${data.vitals.hrv} ms` : 'No data'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Blood Pressure (avg):</Text>
            <Text style={styles.value}>{data.vitals.bp ? `${data.vitals.bp.systolic}/${data.vitals.bp.diastolic} mmHg` : 'No data'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Weight:</Text>
            <Text style={styles.value}>{data.vitals.weight ? `${data.vitals.weight} lbs` : 'No data'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Body Battery (avg):</Text>
            <Text style={styles.value}>{data.vitals.bodyBattery ? `${data.vitals.bodyBattery}/100` : 'No data'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Sleep (avg):</Text>
            <Text style={styles.value}>{data.vitals.sleepHours ? `${data.vitals.sleepHours} hrs/night` : 'No data'}</Text>
          </View>
        </View>

        {/* Changes Since Last Visit */}
        {data.changesSummary.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Changes Since Last Visit</Text>
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <Text style={[styles.changeMetric, { color: '#94a3b8', fontSize: 8 }]}>Metric</Text>
              <Text style={[styles.changePrev, { color: '#94a3b8', fontSize: 8 }]}>Previous</Text>
              <Text style={[styles.changeCurrent, { color: '#94a3b8', fontSize: 8 }]}>Current</Text>
              <Text style={[styles.changeTrend, { color: '#94a3b8', fontSize: 8 }]}>Trend</Text>
              <Text style={{ flex: 1, color: '#94a3b8', fontSize: 8 }}>Note</Text>
            </View>
            {data.changesSummary.map((change, i) => (
              <View key={i} style={styles.changeRow}>
                <Text style={styles.changeMetric}>{change.metric}</Text>
                <Text style={styles.changePrev}>{change.previous_value}</Text>
                <Text style={styles.changeCurrent}>{change.current_value}</Text>
                <Text style={[styles.changeTrend, { color: TREND_COLORS[change.trend] || '#64748b' }]}>
                  {TREND_LABELS[change.trend] || change.trend}
                </Text>
                <Text style={styles.changeNote}>{change.note}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Questions to Ask */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Questions to Ask ({data.suggestedQuestions.length})</Text>
          {data.suggestedQuestions.map((q, i) => (
            <View key={i} style={styles.questionBlock}>
              <Text style={[styles.questionPriority, { color: PRIORITY_COLORS[q.priority] || '#64748b' }]}>
                {q.priority} — {q.category}
              </Text>
              <Text style={styles.questionText}>{i + 1}. {q.question}</Text>
              <Text style={styles.questionContext}>{q.context}</Text>
              {q.data_point && <Text style={styles.questionData}>Data: {q.data_point}</Text>}
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Mission Control — Cardiac Health Intelligence</Text>
          <Text style={styles.footerText}>Confidential — For patient/provider use only</Text>
        </View>
      </Page>

      {/* Page 2: Medications + Notes */}
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { fontSize: 16 }]}>Medications & Notes</Text>
          <Text style={styles.headerMeta}>{data.patientName} — {data.appointmentDate}</Text>
        </View>

        {/* Prescriptions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Prescriptions ({prescriptions.length})</Text>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={[styles.medName, { color: '#94a3b8', fontSize: 8 }]}>Medication</Text>
            <Text style={[styles.medDose, { color: '#94a3b8', fontSize: 8 }]}>Dose</Text>
            <Text style={[styles.medFreq, { color: '#94a3b8', fontSize: 8 }]}>Frequency</Text>
            <Text style={{ flex: 1, color: '#94a3b8', fontSize: 8 }}>Purpose</Text>
          </View>
          {prescriptions.map((med, i) => (
            <View key={i} style={styles.medRow}>
              <Text style={styles.medName}>{med.name}</Text>
              <Text style={styles.medDose}>{med.dosage || '—'}</Text>
              <Text style={styles.medFreq}>{med.frequency || '—'}</Text>
              <Text style={styles.medPurpose}>{med.purpose || ''}</Text>
            </View>
          ))}
        </View>

        {/* Supplements */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Supplements ({supplements.length})</Text>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            <Text style={[styles.medName, { color: '#94a3b8', fontSize: 8 }]}>Supplement</Text>
            <Text style={[styles.medDose, { color: '#94a3b8', fontSize: 8 }]}>Dose</Text>
            <Text style={[styles.medFreq, { color: '#94a3b8', fontSize: 8 }]}>Frequency</Text>
            <Text style={{ flex: 1, color: '#94a3b8', fontSize: 8 }}>Purpose</Text>
          </View>
          {supplements.map((med, i) => (
            <View key={i} style={styles.medRow}>
              <Text style={styles.medName}>{med.name}</Text>
              <Text style={styles.medDose}>{med.dosage || '—'}</Text>
              <Text style={styles.medFreq}>{med.frequency || '—'}</Text>
              <Text style={styles.medPurpose}>{med.purpose || ''}</Text>
            </View>
          ))}
        </View>

        {/* Notes Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appointment Notes</Text>
          <Text style={{ fontSize: 8, color: '#94a3b8', marginBottom: 8 }}>
            Use this space during your appointment to record key points, action items, and follow-up tasks.
          </Text>
          <View style={styles.notesArea}>
            <Text style={styles.notesLabel}>Key Discussion Points:</Text>
          </View>
          <View style={[styles.notesArea, { marginTop: 8 }]}>
            <Text style={styles.notesLabel}>Action Items / Follow-ups:</Text>
          </View>
          <View style={[styles.notesArea, { marginTop: 8 }]}>
            <Text style={styles.notesLabel}>Medication Changes:</Text>
          </View>
          <View style={[styles.notesArea, { marginTop: 8 }]}>
            <Text style={styles.notesLabel}>Next Tests / Labs Ordered:</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Mission Control — Cardiac Health Intelligence</Text>
          <Text style={styles.footerText}>Page 2 — Medications & Notes</Text>
        </View>
      </Page>
    </Document>
  );
}
