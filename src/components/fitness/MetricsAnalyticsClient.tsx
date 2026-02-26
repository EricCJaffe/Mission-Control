'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, Moon, TrendingUp } from 'lucide-react';

type Analysis = {
  sleepHRVCorrelation: {
    correlation: string;
    insights: string[];
    recommendations: string[];
  };
  recoveryTrends: {
    overallTrend: string;
    insights: string[];
    recommendations: string[];
  };
  earlyWarnings: {
    warnings: Array<{
      severity: string;
      metric: string;
      message: string;
      recommendation: string;
    }>;
  };
  summary: string;
};

export default function MetricsAnalyticsClient() {
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataPoints, setDataPoints] = useState<number>(0);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/fitness/metrics/analytics');
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Failed to load analytics');
      }

      setAnalysis(data.analysis);
      setDataPoints(data.dataPoints);
    } catch (err) {
      console.error('Analytics error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        <p className="mt-4 text-slate-600">Analyzing your metrics with AI...</p>
        <p className="mt-2 text-sm text-slate-500">
          This may take up to 30 seconds for comprehensive analysis
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
        <h3 className="mb-2 text-lg font-semibold text-red-900">Analysis Failed</h3>
        <p className="mb-4 text-red-700">{error}</p>
        <div className="flex gap-3">
          <button
            onClick={loadAnalytics}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry Analysis
          </button>
          <Link
            href="/fitness/settings/garmin/import"
            className="rounded-lg border border-red-600 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Import More Data
          </Link>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
        <p className="text-slate-500">No analysis available</p>
      </div>
    );
  }

  const severityColors = {
    high: 'bg-red-50 border-red-200 text-red-900',
    medium: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    low: 'bg-blue-50 border-blue-200 text-blue-900',
  };

  const trendColors = {
    improving: 'text-green-600',
    declining: 'text-red-600',
    stable: 'text-slate-600',
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-blue-50 to-purple-50 p-6 shadow-sm">
        <div className="mb-2 text-sm font-medium text-slate-600">
          Analysis based on {dataPoints} days of data
        </div>
        <p className="text-lg leading-relaxed text-slate-800">{analysis.summary}</p>
      </div>

      {/* Early Warnings */}
      {analysis.earlyWarnings.warnings.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2"><AlertCircle size={24} /> Early Warning Signs</h2>
          {analysis.earlyWarnings.warnings.map((warning, idx) => (
            <div
              key={idx}
              className={`rounded-2xl border p-6 shadow-sm ${
                severityColors[warning.severity as keyof typeof severityColors]
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-lg font-semibold">{warning.metric}</h3>
                <span className="rounded-full bg-white/50 px-3 py-1 text-xs font-medium uppercase">
                  {warning.severity} Priority
                </span>
              </div>
              <p className="mb-3 text-sm">{warning.message}</p>
              <div className="rounded-lg bg-white/50 p-3">
                <div className="mb-1 text-xs font-medium uppercase">Recommendation</div>
                <p className="text-sm">{warning.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sleep/HRV Correlation */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-2xl font-bold flex items-center gap-2"><Moon size={24} /> Sleep & HRV Correlation</h2>
        <div className="mb-4">
          <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
            {analysis.sleepHRVCorrelation.correlation.toUpperCase()} Correlation
          </span>
        </div>

        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold uppercase text-slate-600">Insights</h3>
          <ul className="list-inside list-disc space-y-2">
            {analysis.sleepHRVCorrelation.insights.map((insight, idx) => (
              <li key={idx} className="text-slate-700">
                {insight}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase text-slate-600">Recommendations</h3>
          <ul className="list-inside list-disc space-y-2">
            {analysis.sleepHRVCorrelation.recommendations.map((rec, idx) => (
              <li key={idx} className="text-slate-700">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Recovery Trends */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-2xl font-bold flex items-center gap-2"><TrendingUp size={24} /> Recovery Trends</h2>
        <div className="mb-4">
          <span
            className={`text-lg font-semibold ${
              trendColors[analysis.recoveryTrends.overallTrend as keyof typeof trendColors]
            }`}
          >
            Overall Trend: {analysis.recoveryTrends.overallTrend.toUpperCase()}
          </span>
        </div>

        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold uppercase text-slate-600">Insights</h3>
          <ul className="list-inside list-disc space-y-2">
            {analysis.recoveryTrends.insights.map((insight, idx) => (
              <li key={idx} className="text-slate-700">
                {insight}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase text-slate-600">Recommendations</h3>
          <ul className="list-inside list-disc space-y-2">
            {analysis.recoveryTrends.recommendations.map((rec, idx) => (
              <li key={idx} className="text-slate-700">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href="/fitness/metrics/history"
          className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          View History
        </Link>
        <Link
          href="/fitness/metrics/trends"
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          View Trends
        </Link>
        <button
          onClick={loadAnalytics}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh Analysis
        </button>
      </div>

      {/* Disclaimer */}
      <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600">
        <strong>Disclaimer:</strong> This AI analysis is for informational purposes only and should
        not replace professional medical advice. Consult with your healthcare provider before making
        any changes to your health routine.
      </div>
    </div>
  );
}
