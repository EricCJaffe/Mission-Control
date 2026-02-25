// ============================================================
// CYCLING POWER ZONES — Based on FTP (Functional Threshold Power)
// More accurate than HR zones for cycling (no cardiac lag)
// ============================================================

import type { PowerZones } from './types';

/**
 * Calculate power zones from FTP using Coggan's classic 7-zone model
 * (We use 6 zones to keep it practical — Z7 neuromuscular is sprint-only)
 */
export function calculatePowerZones(ftp: number): PowerZones {
  return {
    ftp,
    z1: [0, Math.round(ftp * 0.55)],                            // Active Recovery
    z2: [Math.round(ftp * 0.56), Math.round(ftp * 0.75)],       // Endurance
    z3: [Math.round(ftp * 0.76), Math.round(ftp * 0.90)],       // Tempo
    z4: [Math.round(ftp * 0.91), Math.round(ftp * 1.05)],       // Threshold
    z5: [Math.round(ftp * 1.06), Math.round(ftp * 1.20)],       // VO2max
    z6: [Math.round(ftp * 1.21), Math.round(ftp * 1.50)],       // Anaerobic
  };
}

/**
 * Determine which power zone a given wattage falls into
 */
export function getPowerZone(watts: number, ftp: number): { zone: number; name: string; pctFtp: number } {
  const pctFtp = Math.round((watts / ftp) * 100);
  if (pctFtp <= 55) return { zone: 1, name: 'Active Recovery', pctFtp };
  if (pctFtp <= 75) return { zone: 2, name: 'Endurance', pctFtp };
  if (pctFtp <= 90) return { zone: 3, name: 'Tempo', pctFtp };
  if (pctFtp <= 105) return { zone: 4, name: 'Threshold', pctFtp };
  if (pctFtp <= 120) return { zone: 5, name: 'VO2max', pctFtp };
  return { zone: 6, name: 'Anaerobic', pctFtp };
}

/**
 * Calculate cycling TSS from normalized power and FTP
 * More accurate than HR-based TSS for cycling
 */
export function cyclingTSS(durationSec: number, normalizedPower: number, ftp: number): number {
  if (ftp <= 0 || durationSec <= 0 || normalizedPower <= 0) return 0;
  const intensityFactor = normalizedPower / ftp;
  return Math.round(((durationSec * normalizedPower * intensityFactor) / (ftp * 3600)) * 100 * 10) / 10;
}

/**
 * Estimate FTP from a 20-minute test (standard protocol)
 * FTP ≈ 95% of 20-minute average power
 */
export function estimateFTPFrom20Min(avgPower20min: number): number {
  return Math.round(avgPower20min * 0.95);
}

/**
 * Estimate FTP from a ramp test (final minute average power)
 * FTP ≈ 75% of final completed minute's average power
 */
export function estimateFTPFromRamp(finalMinutePower: number): number {
  return Math.round(finalMinutePower * 0.75);
}
