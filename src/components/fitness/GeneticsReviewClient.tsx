'use client';

import { useState, useMemo } from 'react';
import { Dna, AlertTriangle, AlertCircle, Info, Check, Trash2, Loader2, Sparkles, ArrowLeft, Dumbbell, Stethoscope, Pill, UtensilsCrossed, MessageSquare } from 'lucide-react';

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

type FileUpload = {
  id: string;
  file_name: string;
  file_type: string;
  processing_status: string;
  uploaded_at?: string;
  created_at?: string;
};

type GeneExplanation = {
  gene: string;
  variant?: string;
  snp_id: string;
  genotype: string;
  risk_level: string;
  what_it_means: string;
  action_items: string[];
};

type SupplementRec = {
  supplement: string;
  reason: string;
  dosage?: string;
  priority: string;
  caution?: string;
};

type LifestyleRec = {
  area: string;
  recommendation: string;
  priority: string;
};

type DietaryRec = {
  area: string;
  recommendation: string;
  foods?: string[];
  priority: string;
};

type MedicationNote = {
  medication: string;
  note: string;
};

type Analysis = {
  summary?: string;
  gene_explanations?: GeneExplanation[];
  supplement_recommendations?: SupplementRec[];
  lifestyle_recommendations?: LifestyleRec[];
  dietary_recommendations?: DietaryRec[];
  medication_notes?: MedicationNote[];
  cardiac_relevance?: string;
  things_to_discuss_with_doctor?: string[];
};

type Props = {
  pendingUploads: FileUpload[];
  completedUploads: FileUpload[];
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

export default function GeneticsReviewClient({ pendingUploads, completedUploads }: Props) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedUpload, setSelectedUpload] = useState<FileUpload | null>(null);
  const [markers, setMarkers] = useState<GeneticMarker[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Group markers by gene
  const groupedByGene = useMemo(() => {
    const grouped = new Map<string, GeneticMarker[]>();
    for (const marker of markers) {
      if (!grouped.has(marker.gene)) {
        grouped.set(marker.gene, []);
      }
      grouped.get(marker.gene)!.push(marker);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [markers]);

  // Risk summary
  const riskSummary = useMemo(() => {
    const summary = { normal: 0, moderate: 0, high: 0 };
    markers.forEach((m) => {
      if (m.risk_level && m.risk_level in summary) {
        summary[m.risk_level as keyof typeof summary]++;
      }
    });
    return summary;
  }, [markers]);

  const loadMarkers = async (fileId: string) => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/fitness/health/genetics?file_id=${fileId}`);
      const data = await res.json();
      const upload = [...pendingUploads, ...completedUploads].find(u => u.id === fileId) || data.fileUpload || null;
      setSelectedUpload(upload);
      setMarkers(data.markers || []);
      setAnalysis(data.analysis || null);
      setSelectedFileId(fileId);
    } catch {
      setError('Failed to load markers');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!selectedFileId) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch('/api/fitness/health/genetics', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: selectedFileId, confirm: true }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalysis(data.analysis);
        // Redirect to labs dashboard methylation tab after brief delay
        setTimeout(() => {
          window.location.href = '/fitness/health/labs/dashboard?tab=methylation';
        }, 2000);
      } else {
        setError(data.error || 'Confirm failed');
      }
    } catch {
      setError('Failed to confirm markers');
    } finally {
      setConfirming(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFileId) return;
    if (!window.confirm('Delete all markers from this upload?')) return;
    setDeleting(true);
    try {
      await fetch(`/api/fitness/health/genetics?file_id=${selectedFileId}`, {
        method: 'DELETE',
      });
      setSelectedFileId(null);
      setSelectedUpload(null);
      setMarkers([]);
      setAnalysis(null);
      window.location.reload();
    } catch {
      setError('Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // Detail view
  if (selectedFileId && selectedUpload) {
    const isPending = pendingUploads.some(u => u.id === selectedFileId);

    return (
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => { setSelectedFileId(null); setSelectedUpload(null); setMarkers([]); setAnalysis(null); }}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to list
        </button>

        {/* File info */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedUpload?.file_name || 'Genetic Report'}</h2>
              <p className="text-sm text-slate-500">
                {markers.length} SNPs extracted
                {(selectedUpload?.uploaded_at || selectedUpload?.created_at)
                  ? ` \u2022 Uploaded ${new Date(selectedUpload.uploaded_at || selectedUpload.created_at!).toLocaleDateString()}`
                  : ''}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
              isPending ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
            }`}>
              {isPending ? 'Needs Review' : 'Confirmed'}
            </span>
          </div>
        </div>

        {markers.length > 0 && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                  <Info className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-green-700">{riskSummary.normal}</p>
                  <p className="text-xs text-green-600">Normal</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-yellow-700">{riskSummary.moderate}</p>
                  <p className="text-xs text-yellow-600">Moderate</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-red-700">{riskSummary.high}</p>
                  <p className="text-xs text-red-600">High Risk</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rich AI Analysis (after confirm) */}
        {analysis && (
          <AnalysisDisplay analysis={analysis} />
        )}

        {markers.length > 0 ? (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-slate-900">Raw SNP Data</h3>
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
                              <span className="font-medium">Notes: </span>
                              {marker.clinical_significance}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Structured Report Review</h3>
            <p className="text-sm text-slate-600">
              This report stores structured findings and AI analysis rather than individual rows in `genetic_markers`.
              Review the analysis below and confirm it to move the report forward.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {isPending && (
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              {confirming ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Generating Analysis...</>
              ) : (
                <><Check className="h-4 w-4" /> Confirm &amp; Generate Analysis</>
              )}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-red-50 text-red-700 border border-red-200 rounded-xl font-medium hover:bg-red-100 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </button>
        </div>

        {/* Redirect notice */}
        {analysis && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-sm text-green-800">
              <Sparkles className="inline h-4 w-4 mr-1" />
              Analysis saved. Redirecting to Methylation Dashboard...
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-800"><strong>Error:</strong> {error}</p>
          </div>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-6">
      {/* Pending uploads */}
      {pendingUploads.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Needs Review</h2>
          <div className="space-y-3">
            {pendingUploads.map((upload) => (
              <button
                key={upload.id}
                onClick={() => loadMarkers(upload.id)}
                className="w-full flex items-center justify-between p-4 border border-yellow-200 bg-yellow-50 rounded-xl hover:bg-yellow-100 transition-colors text-left min-h-[44px]"
              >
                <div>
                  <p className="font-medium text-slate-900">{upload.file_name}</p>
                  <p className="text-sm text-slate-600">
                    {upload.uploaded_at ? `Uploaded ${new Date(upload.uploaded_at).toLocaleDateString()}` : 'Recently uploaded'}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 border border-yellow-200">
                  Needs Review
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Completed uploads */}
      {completedUploads.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Confirmed</h2>
          <div className="space-y-3">
            {completedUploads.map((upload) => (
              <button
                key={upload.id}
                onClick={() => loadMarkers(upload.id)}
                className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left min-h-[44px]"
              >
                <div>
                  <p className="font-medium text-slate-900">{upload.file_name}</p>
                  <p className="text-sm text-slate-600">
                    {upload.uploaded_at ? `Uploaded ${new Date(upload.uploaded_at).toLocaleDateString()}` : 'Recently uploaded'}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                  Confirmed
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {pendingUploads.length === 0 && completedUploads.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-8 text-center">
          <Dna className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No genetic reports uploaded yet.</p>
          <p className="text-xs text-slate-400 mt-1">
            Upload a methylation or genetic report to see extracted SNP data here.
          </p>
          <a
            href="/fitness/health/upload"
            className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Upload Report
          </a>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          <span className="ml-2 text-sm text-slate-600">Loading markers...</span>
        </div>
      )}
    </div>
  );
}

/**
 * Rich analysis display component
 */
function AnalysisDisplay({ analysis }: { analysis: Analysis }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      {analysis.summary && (
        <div className="rounded-2xl border border-purple-200 bg-gradient-to-br from-purple-50 to-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-purple-900">AI Analysis Summary</h3>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{analysis.summary}</p>
        </div>
      )}

      {/* Gene-by-Gene Explanations */}
      {analysis.gene_explanations && analysis.gene_explanations.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Dna className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-900">What Your Genes Mean</h3>
          </div>
          <div className="space-y-4">
            {analysis.gene_explanations.map((gene, idx) => (
              <div key={idx} className={`rounded-xl p-4 border ${
                gene.risk_level === 'high' ? 'border-red-200 bg-red-50/50' :
                gene.risk_level === 'moderate' ? 'border-yellow-200 bg-yellow-50/50' :
                'border-green-200 bg-green-50/50'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-slate-900">{gene.gene}</span>
                  {gene.variant && <span className="text-xs text-slate-500">({gene.variant})</span>}
                  <span className="font-mono text-xs text-slate-500">{gene.snp_id}</span>
                  <span className={`ml-auto px-2 py-0.5 rounded-full text-xs font-medium ${
                    gene.risk_level === 'high' ? 'bg-red-100 text-red-700' :
                    gene.risk_level === 'moderate' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {gene.risk_level}
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed mb-2">{gene.what_it_means}</p>
                {gene.action_items && gene.action_items.length > 0 && (
                  <ul className="space-y-1">
                    {gene.action_items.map((item, i) => (
                      <li key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="text-blue-500 mt-0.5">&#x2192;</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supplement Recommendations */}
      {analysis.supplement_recommendations && analysis.supplement_recommendations.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Pill className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold text-slate-900">Supplement Recommendations</h3>
          </div>
          <div className="space-y-3">
            {analysis.supplement_recommendations.map((rec, idx) => (
              <div key={idx} className="rounded-xl border border-green-100 bg-green-50/50 p-4">
                <div className="flex items-start justify-between mb-1">
                  <p className="font-medium text-sm text-slate-900">{rec.supplement}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                    rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {rec.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mb-1">{rec.reason}</p>
                {rec.dosage && (
                  <p className="text-xs text-slate-500 font-mono">{rec.dosage}</p>
                )}
                {rec.caution && (
                  <p className="text-xs text-amber-700 mt-1 flex items-start gap-1">
                    <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    {rec.caution}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dietary Recommendations */}
      {analysis.dietary_recommendations && analysis.dietary_recommendations.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <UtensilsCrossed className="h-5 w-5 text-orange-600" />
            <h3 className="text-lg font-semibold text-slate-900">Dietary Recommendations</h3>
          </div>
          <div className="space-y-3">
            {analysis.dietary_recommendations.map((rec, idx) => (
              <div key={idx} className="rounded-xl border border-orange-100 bg-orange-50/50 p-4">
                <p className="font-medium text-sm text-slate-900 mb-1">{rec.area}</p>
                <p className="text-xs text-slate-600 mb-2">{rec.recommendation}</p>
                {rec.foods && rec.foods.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {rec.foods.map((food, i) => (
                      <span key={i} className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                        {food}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lifestyle Recommendations */}
      {analysis.lifestyle_recommendations && analysis.lifestyle_recommendations.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Dumbbell className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-slate-900">Lifestyle Recommendations</h3>
          </div>
          <div className="space-y-3">
            {analysis.lifestyle_recommendations.map((rec, idx) => (
              <div key={idx} className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
                <p className="font-medium text-sm text-slate-900 mb-1">{rec.area}</p>
                <p className="text-xs text-slate-600">{rec.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Medication Notes */}
      {analysis.medication_notes && analysis.medication_notes.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Stethoscope className="h-5 w-5 text-purple-600" />
            <h3 className="text-lg font-semibold text-slate-900">Medication Interactions</h3>
          </div>
          <div className="space-y-3">
            {analysis.medication_notes.map((note, idx) => (
              <div key={idx} className="rounded-xl border border-purple-100 bg-purple-50/50 p-4">
                <p className="font-medium text-sm text-slate-900 mb-1">{note.medication}</p>
                <p className="text-xs text-slate-600">{note.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cardiac Relevance */}
      {analysis.cardiac_relevance && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Stethoscope className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold text-red-900">Cardiac Relevance</h3>
          </div>
          <p className="text-sm text-red-800 leading-relaxed">{analysis.cardiac_relevance}</p>
        </div>
      )}

      {/* Things to Discuss with Doctor */}
      {analysis.things_to_discuss_with_doctor && analysis.things_to_discuss_with_doctor.length > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-blue-900">Bring Up at Your Next Appointment</h3>
          </div>
          <ul className="space-y-2">
            {analysis.things_to_discuss_with_doctor.map((item, idx) => (
              <li key={idx} className="text-sm text-blue-800 flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                  {idx + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
