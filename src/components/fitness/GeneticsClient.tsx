'use client';

import { useState, useMemo } from 'react';
import { Dna, AlertTriangle, AlertCircle, Info, Search } from 'lucide-react';

type GeneticMarker = {
  id: string;
  snp_id: string;
  gene: string;
  genotype: string;
  risk_level: 'normal' | 'moderate' | 'high' | null;
  clinical_significance: string | null;
  supplement_implications: string | null;
  created_at: string;
};

type Props = {
  markers: GeneticMarker[];
};

const RISK_STYLES = {
  normal: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    icon: <Info className="h-4 w-4" />,
  },
  moderate: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    icon: <AlertCircle className="h-4 w-4" />,
  },
  high: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
};

export default function GeneticsClient({ markers }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | 'normal' | 'moderate' | 'high'>('all');

  // Filter markers
  const filteredMarkers = useMemo(() => {
    return markers.filter((marker) => {
      const matchesSearch =
        searchTerm === '' ||
        marker.gene.toLowerCase().includes(searchTerm.toLowerCase()) ||
        marker.snp_id.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesRisk = riskFilter === 'all' || marker.risk_level === riskFilter;

      return matchesSearch && matchesRisk;
    });
  }, [markers, searchTerm, riskFilter]);

  // Group by gene
  const groupedByGene = useMemo(() => {
    const grouped = new Map<string, GeneticMarker[]>();
    for (const marker of filteredMarkers) {
      if (!grouped.has(marker.gene)) {
        grouped.set(marker.gene, []);
      }
      grouped.get(marker.gene)!.push(marker);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredMarkers]);

  // Risk summary stats
  const riskSummary = useMemo(() => {
    const summary = { normal: 0, moderate: 0, high: 0 };
    markers.forEach((m) => {
      if (m.risk_level && m.risk_level in summary) {
        summary[m.risk_level as keyof typeof summary]++;
      }
    });
    return summary;
  }, [markers]);

  if (markers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
        <Dna className="mx-auto h-12 w-12 text-slate-300 mb-3" />
        <p className="text-sm text-slate-500">No genetic data uploaded yet.</p>
        <p className="text-xs text-slate-400 mt-1">
          Upload methylation reports or genetic test results to see your SNP data here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Risk Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Info className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">{riskSummary.normal}</p>
              <p className="text-xs text-green-600">Normal Risk</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
              <AlertCircle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-700">{riskSummary.moderate}</p>
              <p className="text-xs text-yellow-600">Moderate Risk</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-700">{riskSummary.high}</p>
              <p className="text-xs text-red-600">High Risk</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by gene or SNP ID..."
              className="w-full rounded-lg border border-slate-200 pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="flex gap-2">
            {(['all', 'normal', 'moderate', 'high'] as const).map((risk) => (
              <button
                key={risk}
                onClick={() => setRiskFilter(risk)}
                className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition ${
                  riskFilter === risk
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {risk}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Genetic Markers Grouped by Gene */}
      {groupedByGene.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">No markers match your filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByGene.map(([gene, geneMarkers]) => (
            <div key={gene} className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Dna className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-slate-900">{gene}</h3>
                  <span className="ml-auto text-xs text-slate-500">
                    {geneMarkers.length} SNP{geneMarkers.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {geneMarkers.map((marker) => {
                  const riskStyle = marker.risk_level
                    ? RISK_STYLES[marker.risk_level]
                    : RISK_STYLES.normal;

                  return (
                    <div key={marker.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-mono text-sm font-medium text-slate-900">
                              {marker.snp_id}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${riskStyle.bg} ${riskStyle.border} ${riskStyle.text} border`}
                            >
                              {riskStyle.icon}
                              {marker.risk_level || 'unknown'}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">Genotype:</span>
                              <span className="font-mono text-sm font-medium text-slate-700">
                                {marker.genotype}
                              </span>
                            </div>

                            {marker.clinical_significance && (
                              <div className="text-sm text-slate-700">
                                <span className="font-medium">Clinical: </span>
                                {marker.clinical_significance}
                              </div>
                            )}

                            {marker.supplement_implications && (
                              <div className="text-sm text-blue-700 bg-blue-50 rounded p-2 mt-2">
                                <span className="font-medium">Supplement implications: </span>
                                {marker.supplement_implications}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="text-center text-xs text-slate-400">
        Showing {filteredMarkers.length} of {markers.length} genetic markers
      </div>
    </div>
  );
}
