export const GENETIC_REPORT_TYPES = [
  'methylation_report',
  'genetics_neurotransmitter',
  'genetics_detox',
  'genetics_mitochondrial',
  'genetics_hormone',
  'genetics_nutrition',
] as const;

export type GeneticReportType = typeof GENETIC_REPORT_TYPES[number];

export const GENETIC_REPORT_LABELS: Record<GeneticReportType, string> = {
  methylation_report: 'Stride Methylation Report',
  genetics_neurotransmitter: 'Stride Sleep / Neurotransmitter Report',
  genetics_detox: 'Stride Skin / Detox Report',
  genetics_mitochondrial: 'Stride Fitness / Mitochondrial Report',
  genetics_hormone: 'Hormone & Endocrine Genetics Report',
  genetics_nutrition: 'Stride Nutrition Report',
};

export function isGeneticReportType(type: string): type is GeneticReportType {
  return GENETIC_REPORT_TYPES.includes(type as GeneticReportType);
}

export function detectGeneticReportTypeFromFilename(fileName: string): GeneticReportType | null {
  const normalized = fileName.toLowerCase();

  if (normalized.includes('methylation')) return 'methylation_report';
  if (normalized.includes('sleep')) return 'genetics_neurotransmitter';
  if (normalized.includes('skin')) return 'genetics_detox';
  if (normalized.includes('fitness')) return 'genetics_mitochondrial';
  if (normalized.includes('hormone') || normalized.includes('endocrine')) return 'genetics_hormone';
  if (normalized.includes('nutrition') || normalized.includes('nutritional')) return 'genetics_nutrition';

  return null;
}
