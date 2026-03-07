import type { RecoveryModality, RecoverySession } from '@/lib/fitness/types';

type RecoverySummary = {
  totalSessions: number;
  totalMinutes: number;
  modalityCounts: Record<RecoveryModality, number>;
  avgPerceivedRecovery: number | null;
  avgEnergyDelta: number | null;
  avgSorenessDelta: number | null;
};

export function summarizeRecoverySessions(sessions: RecoverySession[]): RecoverySummary {
  const modalityCounts: Record<RecoveryModality, number> = {
    sauna: 0,
    cold_plunge: 0,
    stretching: 0,
    mobility: 0,
  };

  let totalMinutes = 0;
  let perceivedRecoverySum = 0;
  let perceivedRecoveryCount = 0;
  let energyDeltaSum = 0;
  let energyDeltaCount = 0;
  let sorenessDeltaSum = 0;
  let sorenessDeltaCount = 0;

  for (const session of sessions) {
    modalityCounts[session.modality] += 1;
    totalMinutes += Number(session.duration_min || 0);

    if (typeof session.perceived_recovery === 'number') {
      perceivedRecoverySum += session.perceived_recovery;
      perceivedRecoveryCount += 1;
    }
    if (typeof session.energy_before === 'number' && typeof session.energy_after === 'number') {
      energyDeltaSum += session.energy_after - session.energy_before;
      energyDeltaCount += 1;
    }
    if (typeof session.soreness_before === 'number' && typeof session.soreness_after === 'number') {
      sorenessDeltaSum += session.soreness_after - session.soreness_before;
      sorenessDeltaCount += 1;
    }
  }

  return {
    totalSessions: sessions.length,
    totalMinutes,
    modalityCounts,
    avgPerceivedRecovery: perceivedRecoveryCount > 0 ? round1(perceivedRecoverySum / perceivedRecoveryCount) : null,
    avgEnergyDelta: energyDeltaCount > 0 ? round1(energyDeltaSum / energyDeltaCount) : null,
    avgSorenessDelta: sorenessDeltaCount > 0 ? round1(sorenessDeltaSum / sorenessDeltaCount) : null,
  };
}

export function modalityLabel(modality: RecoveryModality) {
  switch (modality) {
    case 'sauna':
      return 'Sauna';
    case 'cold_plunge':
      return 'Cold Plunge';
    case 'stretching':
      return 'Stretching';
    case 'mobility':
      return 'Mobility';
  }
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
