'use client';

import { X, AlertTriangle, CheckCircle, TestTube } from 'lucide-react';

type AIReview = {
  overall_assessment: 'SAFE' | 'CAUTION' | 'CONCERN';
  summary: string;
  interactions: Array<{
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    recommendation: string;
  }>;
  warnings: Array<{
    type: string;
    message: string;
    action: string;
  }>;
  recommendations: Array<{
    category: string;
    item: string;
    reasoning: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  lab_correlations?: Array<{
    lab_marker: string;
    current_value?: string;
    assessment: string;
    suggestion: string;
  }>;
};

type Props = {
  review: AIReview;
  lastReviewedAt: string | null;
  onClose: () => void;
};

export default function RegimenDetailsModal({ review, lastReviewedAt, onClose }: Props) {
  const assessmentColor = {
    SAFE: 'text-green-700 bg-green-50 border-green-200',
    CAUTION: 'text-yellow-700 bg-yellow-50 border-yellow-200',
    CONCERN: 'text-red-700 bg-red-50 border-red-200',
  };

  const severityColor = {
    HIGH: 'text-red-700 bg-red-50',
    MEDIUM: 'text-yellow-700 bg-yellow-50',
    LOW: 'text-blue-700 bg-blue-50',
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Complete Regimen Analysis</h3>
            {lastReviewedAt && (
              <p className="text-xs text-slate-500 mt-1">
                Last reviewed: {new Date(lastReviewedAt).toLocaleString()}
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Overall Assessment */}
          <div className={`rounded-lg border p-4 ${assessmentColor[review.overall_assessment]}`}>
            <div className="flex items-start gap-3">
              {review.overall_assessment === 'SAFE' && <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
              {(review.overall_assessment === 'CAUTION' || review.overall_assessment === 'CONCERN') && (
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-semibold mb-1">Overall Assessment: {review.overall_assessment}</p>
                <p className="text-sm">{review.summary}</p>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {review.warnings && review.warnings.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">⚠️ Warnings</h4>
              <div className="space-y-2">
                {review.warnings.map((warning, i) => (
                  <div key={i} className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                    <p className="text-sm font-medium text-orange-900">{warning.type}</p>
                    <p className="text-sm text-orange-700 mt-1">{warning.message}</p>
                    <p className="text-xs text-orange-600 mt-1">→ {warning.action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Interactions */}
          {review.interactions && review.interactions.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">🔗 Interactions</h4>
              <div className="space-y-2">
                {review.interactions.map((interaction, i) => (
                  <div key={i} className={`rounded-lg p-3 ${severityColor[interaction.severity]}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase">{interaction.severity}</span>
                    </div>
                    <p className="text-sm mb-1">{interaction.description}</p>
                    <p className="text-xs">→ {interaction.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {review.recommendations && review.recommendations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2">💡 Recommendations</h4>
              <div className="space-y-2">
                {review.recommendations.map((rec, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-600">{rec.category}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${severityColor[rec.priority]}`}>
                        {rec.priority}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900">{rec.item}</p>
                    <p className="text-sm text-slate-600 mt-1">{rec.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lab Correlations */}
          {review.lab_correlations && review.lab_correlations.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <TestTube className="w-4 h-4" />
                Lab Correlations
              </h4>
              <div className="space-y-2">
                {review.lab_correlations.map((lab, i) => (
                  <div key={i} className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-blue-900">{lab.lab_marker}</p>
                      {lab.current_value && <span className="text-xs text-blue-700">{lab.current_value}</span>}
                    </div>
                    <p className="text-sm text-blue-700 mb-1">{lab.assessment}</p>
                    {lab.suggestion && <p className="text-xs text-blue-600">→ {lab.suggestion}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-600">
              ⚕️ <strong>Important:</strong> This analysis is for informational purposes only. Always consult your
              cardiologist before making any changes to your medication regimen.
            </p>
          </div>
        </div>

        {/* Close Button */}
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 min-h-[44px]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
