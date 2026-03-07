import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

export interface HealthCommandCenterReportData {
  patientName: string;
  generatedAt: string;
  executiveSummary: string;
  topPriorities: string[];
  whatIsWorking: string[];
  risksToWatch: string[];
  crossDomainConnections: string[];
  doctorConversationTopics: string[];
  openQuestionsForUser: string[];
  trainingDirection: {
    overallRecommendation: string;
    bestNextBlock: string;
    rationale: string[];
    guardrails: string[];
  };
  snapshot: {
    labPanels: number;
    geneticsReports: number;
    imagingReports: number;
    medsCount: number;
    supplementsCount: number;
    pendingUpdates: number;
    restingHr: number | null;
    hrv: number | null;
    sleep: number | null;
    bp: { systolic: number; diastolic: number } | null;
    activePlanName: string | null;
  };
  suggestedUpdates: Array<{
    section_number: number;
    section_name: string;
    reason: string;
    confidence: string;
  }>;
}

const styles = StyleSheet.create({
  page: { padding: 38, fontFamily: 'Helvetica', fontSize: 10, color: '#1e293b' },
  header: { marginBottom: 18, borderBottomWidth: 2, borderBottomColor: '#0f172a', paddingBottom: 10 },
  title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  subtitle: { fontSize: 11, color: '#475569', marginTop: 4 },
  meta: { fontSize: 8, color: '#64748b', marginTop: 6 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#0f172a', marginBottom: 7, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
  twoCol: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  statCard: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 6, padding: 8, marginBottom: 6, backgroundColor: '#f8fafc' },
  statLabel: { fontSize: 8, color: '#64748b', textTransform: 'uppercase', marginBottom: 3 },
  statValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  body: { fontSize: 9.5, lineHeight: 1.55, color: '#334155' },
  bullet: { flexDirection: 'row', marginBottom: 4, paddingLeft: 4 },
  bulletDot: { width: 6, fontSize: 10, color: '#0f172a' },
  bulletText: { flex: 1, fontSize: 9.2, color: '#334155', lineHeight: 1.45 },
  updateRow: { marginBottom: 7, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  updateHeader: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#0f172a' },
  updateMeta: { fontSize: 8, color: '#64748b', marginTop: 2 },
  footer: { position: 'absolute', bottom: 24, left: 38, right: 38, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 6 },
  footerText: { fontSize: 7, color: '#94a3b8' },
});

function BulletList({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item) => (
        <View key={item} style={styles.bullet}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function HealthCommandCenterReport({ data }: { data: HealthCommandCenterReportData }) {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Comprehensive Health Command Center Report</Text>
          <Text style={styles.subtitle}>{data.patientName}</Text>
          <Text style={styles.meta}>Generated: {data.generatedAt} | Mission Control Holistic Health Synthesis</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Executive Summary</Text>
          <Text style={styles.body}>{data.executiveSummary}</Text>
        </View>

        <View style={[styles.section, styles.twoCol]}>
          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Snapshot</Text>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Lab Panels</Text>
              <Text style={styles.statValue}>{data.snapshot.labPanels}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Genetics Reports</Text>
              <Text style={styles.statValue}>{data.snapshot.geneticsReports}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Imaging Reports</Text>
              <Text style={styles.statValue}>{data.snapshot.imagingReports}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Active Meds / Supplements</Text>
              <Text style={styles.statValue}>{data.snapshot.medsCount} / {data.snapshot.supplementsCount}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Pending health.md Updates</Text>
              <Text style={styles.statValue}>{data.snapshot.pendingUpdates}</Text>
            </View>
          </View>

          <View style={styles.col}>
            <Text style={styles.sectionTitle}>Current Metrics</Text>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg Resting HR (7d)</Text>
              <Text style={styles.statValue}>{data.snapshot.restingHr ?? '—'}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg HRV (7d)</Text>
              <Text style={styles.statValue}>{data.snapshot.hrv ?? '—'}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg Sleep (7d)</Text>
              <Text style={styles.statValue}>{data.snapshot.sleep ?? '—'}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg BP (30d)</Text>
              <Text style={styles.statValue}>{data.snapshot.bp ? `${data.snapshot.bp.systolic}/${data.snapshot.bp.diastolic}` : '—'}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Active Plan</Text>
              <Text style={styles.statValue}>{data.snapshot.activePlanName || 'None'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Mission Control</Text>
          <Text style={styles.footerText}>Confidential health synthesis</Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={[styles.title, { fontSize: 17 }]}>Priorities, Risks, and Training Direction</Text>
          <Text style={styles.meta}>{data.patientName}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Priorities</Text>
          <BulletList items={data.topPriorities} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What Is Working</Text>
          <BulletList items={data.whatIsWorking} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Risks To Watch</Text>
          <BulletList items={data.risksToWatch} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Training Direction</Text>
          <Text style={styles.body}>{data.trainingDirection.overallRecommendation}</Text>
          <Text style={[styles.updateHeader, { marginTop: 8 }]}>Best next block: {data.trainingDirection.bestNextBlock}</Text>
          <Text style={[styles.updateMeta, { marginTop: 4 }]}>Rationale</Text>
          <BulletList items={data.trainingDirection.rationale} />
          <Text style={[styles.updateMeta, { marginTop: 6 }]}>Guardrails</Text>
          <BulletList items={data.trainingDirection.guardrails} />
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Mission Control</Text>
          <Text style={styles.footerText}>Page 2</Text>
        </View>
      </Page>

      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <Text style={[styles.title, { fontSize: 17 }]}>Connections, Doctor Topics, and health.md Updates</Text>
          <Text style={styles.meta}>{data.patientName}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cross-Domain Connections</Text>
          <BulletList items={data.crossDomainConnections} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Doctor Conversation Topics</Text>
          <BulletList items={data.doctorConversationTopics} />
        </View>

        {data.openQuestionsForUser.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Open Questions For Further Refinement</Text>
            <BulletList items={data.openQuestionsForUser} />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Suggested health.md Updates</Text>
          {data.suggestedUpdates.length === 0 ? (
            <Text style={styles.body}>No new section updates were suggested in the saved analysis.</Text>
          ) : (
            data.suggestedUpdates.map((update) => (
              <View key={`${update.section_number}-${update.reason}`} style={styles.updateRow}>
                <Text style={styles.updateHeader}>§{update.section_number} {update.section_name}</Text>
                <Text style={styles.updateMeta}>{update.reason}</Text>
                <Text style={styles.updateMeta}>Confidence: {update.confidence}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Mission Control</Text>
          <Text style={styles.footerText}>Page 3</Text>
        </View>
      </Page>
    </Document>
  );
}
