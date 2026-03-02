'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AlertCircle, Bot, FileHeart, Target, TrendingUp, ArrowRight, Dumbbell, Leaf, Stethoscope, Upload, RefreshCw, ChevronDown, ChevronRight, Brain, Zap, FlaskConical, Activity, Pill } from 'lucide-react';

interface LabPanel {
  id: string;
  lab_name: string;
  panel_date: string;
  provider_name: string | null;
  fasting: boolean;
  ai_summary: string | null;
}

interface TestDataPoint {
  date: string;
  value: string;
  unit: string;
  flag: string;
  panel_date: string;
}

interface FlaggedResult {
  test_name: string;
  value: string;
  unit: string;
  reference_range: string;
  flag: string;
  panel_date: string;
  panel_id: string;
}

interface DashboardData {
  panels: LabPanel[];
  test_trends: Record<string, TestDataPoint[]>;
  flagged_results: FlaggedResult[];
  key_metrics: Record<string, TestDataPoint[]>;
  filter_applied: string;
}

interface LabDashboardClientProps {
  userId: string;
  initialTab?: string;
}

interface GeneticReport {
  file_id: string;
  file_name: string;
  file_type: string;
  file_type_label: string;
  file_path: string;
  processing_status: string;
  upload_date: string;
  processed_at: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: Record<string, any> | null;
  marker_count: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markers: Record<string, any>[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markers_by_gene: Record<string, Record<string, any>[]>;
}

interface GeneticsComprehensiveAnalysis {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis: Record<string, any>;
  file_ids: string[];
  report_types: string[];
  generated_at: string;
}

interface ComprehensiveAnalysis {
  executive_summary: string;
  categories: Array<{
    name: string;
    overall_trend: string;
    trend_description: string;
    key_findings: string[];
    clinical_significance: string;
    recommendations: {
      dietary: string[];
      exercise: string[];
      lifestyle: string[];
      medical: string[];
      monitoring: string[];
    };
    priority: string;
  }>;
  priority_actions: string[];
  generated_at: string;
  panels_analyzed: number;
  date_range: { from: string; to: string };
}

export default function LabDashboardClient({ userId, initialTab }: LabDashboardClientProps) {
  const [labType, setLabType] = useState<'bloodwork' | 'methylation'>(
    initialTab === 'methylation' ? 'methylation' : 'bloodwork'
  );
  const [activeTab, setActiveTab] = useState<'overview' | 'trends' | 'tests'>('overview');
  const [filter, setFilter] = useState<string>('all');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTest, setSelectedTest] = useState<string | null>(null);
  const [comprehensiveAnalysis, setComprehensiveAnalysis] = useState<ComprehensiveAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [methylationReports, setMethylationReports] = useState<GeneticReport[]>([]);
  const [methylationLoading, setMethylationLoading] = useState(false);
  const [comprehensiveGeneticsAnalysis, setComprehensiveGeneticsAnalysis] = useState<GeneticsComprehensiveAnalysis | null>(null);
  const [geneticsComprehensiveLoading, setGeneticsComprehensiveLoading] = useState(false);
  const [geneticsComprehensiveError, setGeneticsComprehensiveError] = useState<string | null>(null);
  const [collapsedReports, setCollapsedReports] = useState<Set<string>>(new Set());
  const [refreshingReport, setRefreshingReport] = useState<string | null>(null);

  const loadDashboardData = async (filterValue: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/fitness/health/labs/dashboard?filter=${filterValue}`);
      const dashboardData = await response.json();

      if (!response.ok) {
        throw new Error(dashboardData.error || 'Failed to load dashboard');
      }

      setData(dashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const loadMethylationReports = async () => {
    setMethylationLoading(true);
    try {
      const response = await fetch('/api/fitness/health/methylation');
      const result = await response.json();

      if (response.ok && result.reports) {
        setMethylationReports(result.reports);
        if (result.comprehensive_analysis) {
          setComprehensiveGeneticsAnalysis(result.comprehensive_analysis);
        }
      } else {
        setMethylationReports([]);
      }
    } catch (err) {
      console.error('Failed to load genetics reports:', err);
      setMethylationReports([]);
    } finally {
      setMethylationLoading(false);
    }
  };

  const generateComprehensiveGeneticsAnalysis = async () => {
    setGeneticsComprehensiveLoading(true);
    setGeneticsComprehensiveError(null);
    try {
      const response = await fetch('/api/fitness/health/genetics/comprehensive', {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to generate analysis');
      setComprehensiveGeneticsAnalysis(result.comprehensive_analysis);
    } catch (err) {
      setGeneticsComprehensiveError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setGeneticsComprehensiveLoading(false);
    }
  };

  const refreshGeneticReport = async (fileId: string) => {
    setRefreshingReport(fileId);
    try {
      const response = await fetch(`/api/fitness/health/genetics/${fileId}/refresh`, {
        method: 'POST',
      });
      const result = await response.json();
      if (response.ok && result.analysis) {
        setMethylationReports(prev =>
          prev.map(r => r.file_id === fileId ? { ...r, analysis: result.analysis } : r)
        );
      }
    } catch (err) {
      console.error('Failed to refresh report:', err);
    } finally {
      setRefreshingReport(null);
    }
  };

  const toggleCollapsed = (fileId: string) => {
    setCollapsedReports(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  useEffect(() => {
    if (labType === 'bloodwork') {
      loadDashboardData(filter);
    } else {
      // For methylation, clear the bloodwork loading state
      setLoading(false);
      loadMethylationReports();
    }
  }, [filter, labType]);

  const handleFilterChange = (newFilter: string) => {
    setFilter(newFilter);
    setComprehensiveAnalysis(null); // Clear analysis when filter changes
  };

  const generateComprehensiveAnalysis = async () => {
    setAnalysisLoading(true);
    setAnalysisError(null);

    try {
      const response = await fetch('/api/fitness/health/labs/comprehensive-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate analysis');
      }

      setComprehensiveAnalysis(result.analysis);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const exportToMarkdown = () => {
    if (!comprehensiveAnalysis) return;

    let markdown = `# Lab Results Comprehensive Analysis\n\n`;
    markdown += `**Generated**: ${new Date(comprehensiveAnalysis.generated_at).toLocaleString()}\n`;
    markdown += `**Panels Analyzed**: ${comprehensiveAnalysis.panels_analyzed}\n`;
    markdown += `**Date Range**: ${new Date(comprehensiveAnalysis.date_range.from).toLocaleDateString()} - ${new Date(comprehensiveAnalysis.date_range.to).toLocaleDateString()}\n\n`;
    markdown += `---\n\n`;

    markdown += `## Executive Summary\n\n${comprehensiveAnalysis.executive_summary}\n\n`;
    markdown += `---\n\n`;

    markdown += `## Priority Actions\n\n`;
    comprehensiveAnalysis.priority_actions.forEach((action, idx) => {
      markdown += `${idx + 1}. ${action}\n`;
    });
    markdown += `\n---\n\n`;

    comprehensiveAnalysis.categories.forEach((category) => {
      markdown += `## ${category.name}\n\n`;
      markdown += `**Overall Trend**: ${category.overall_trend.toUpperCase()}\n`;
      markdown += `**Priority**: ${category.priority.toUpperCase()}\n\n`;

      markdown += `### Trend Analysis\n\n${category.trend_description}\n\n`;

      if (category.key_findings.length > 0) {
        markdown += `### Key Findings\n\n`;
        category.key_findings.forEach(finding => {
          markdown += `- ${finding}\n`;
        });
        markdown += `\n`;
      }

      markdown += `### Clinical Significance\n\n${category.clinical_significance}\n\n`;

      markdown += `### Recommendations\n\n`;

      if (category.recommendations.dietary.length > 0) {
        markdown += `#### Dietary\n`;
        category.recommendations.dietary.forEach(rec => markdown += `- ${rec}\n`);
        markdown += `\n`;
      }

      if (category.recommendations.exercise.length > 0) {
        markdown += `#### Exercise\n`;
        category.recommendations.exercise.forEach(rec => markdown += `- ${rec}\n`);
        markdown += `\n`;
      }

      if (category.recommendations.lifestyle.length > 0) {
        markdown += `#### Lifestyle\n`;
        category.recommendations.lifestyle.forEach(rec => markdown += `- ${rec}\n`);
        markdown += `\n`;
      }

      if (category.recommendations.medical.length > 0) {
        markdown += `#### Medical\n`;
        category.recommendations.medical.forEach(rec => markdown += `- ${rec}\n`);
        markdown += `\n`;
      }

      markdown += `---\n\n`;
    });

    // Download as file
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lab-analysis-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getFlagColor = (flag: string) => {
    switch (flag) {
      case 'normal': return 'text-green-600';
      case 'low': return 'text-blue-600';
      case 'high': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getFlagBadgeColor = (flag: string) => {
    switch (flag) {
      case 'normal': return 'bg-green-100 text-green-700';
      case 'low': return 'bg-blue-100 text-blue-700';
      case 'high': return 'bg-yellow-100 text-yellow-700';
      case 'critical': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading && labType === 'bloodwork') {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-600">Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-800">
          <strong>Error:</strong> {error}
        </p>
      </div>
    );
  }

  if (labType === 'bloodwork' && (!data || data.panels.length === 0)) {
    return (
      <div className="space-y-6">
        {/* Lab Type Tabs - still show so user can switch */}
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
          <button
            onClick={() => setLabType('bloodwork')}
            className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
              labType === 'bloodwork' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Blood Work
          </button>
          <button
            onClick={() => setLabType('methylation')}
            className="rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] text-slate-600 hover:bg-slate-50"
          >
            Genetics Reports
          </button>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
          <p className="text-gray-600">
            No confirmed lab panels found. Upload and confirm lab reports first.
          </p>
        </div>
      </div>
    );
  }

  const years = data ? Array.from(new Set(data.panels.map(p => new Date(p.panel_date).getFullYear()))).sort((a, b) => b - a) : [];

  return (
    <div className="space-y-6">
      {/* Lab Type Tabs */}
      <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
        <button
          onClick={() => setLabType('bloodwork')}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
            labType === 'bloodwork' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Blood Work
        </button>
        <button
          onClick={() => setLabType('methylation')}
          className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
            labType === 'methylation' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          Methylation Reports
        </button>
      </div>

      {/* Filter Controls (Blood Work only) */}
      {labType === 'bloodwork' && data && (
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          <button
            onClick={() => handleFilterChange('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All Time ({data.panels.length} panels)
          </button>
          <button
            onClick={() => handleFilterChange('last3')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === 'last3'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Last 3 Panels
          </button>
          {years.map(year => (
            <button
              key={year}
              onClick={() => handleFilterChange(`year:${year}`)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === `year:${year}`
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Blood Work Dashboard */}
      {labType === 'bloodwork' && data && (
      <>
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('trends')}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === 'trends'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Key Trends
          </button>
          <button
            onClick={() => setActiveTab('tests')}
            className={`pb-3 px-1 text-sm font-medium transition-colors ${
              activeTab === 'tests'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            All Tests ({Object.keys(data.test_trends).length})
          </button>
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Total Panels</p>
              <p className="text-3xl font-bold text-gray-900">{data.panels.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Tests Tracked</p>
              <p className="text-3xl font-bold text-gray-900">{Object.keys(data.test_trends).length}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Flagged Results</p>
              <p className="text-3xl font-bold text-yellow-600">{data.flagged_results.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-600 mb-1">Date Range</p>
              <p className="text-sm font-medium text-gray-900">
                {new Date(data.panels[data.panels.length - 1].panel_date).toLocaleDateString()} -
                {' '}{new Date(data.panels[0].panel_date).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Flagged Results Across All Panels */}
          {data.flagged_results.length > 0 && (
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-6">
              <h3 className="text-lg font-semibold text-yellow-900 mb-4">
                <span className="inline-flex items-center gap-2"><AlertCircle size={20} /> Flagged Results ({data.flagged_results.length})</span>
              </h3>
              <div className="space-y-2">
                {data.flagged_results.slice(0, 10).map((result, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">{result.test_name}</p>
                      <p className="text-xs text-gray-500">{new Date(result.panel_date).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{result.value} {result.unit}</p>
                      <p className="text-xs text-gray-500">Ref: {result.reference_range}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getFlagBadgeColor(result.flag)}`}>
                      {result.flag}
                    </span>
                  </div>
                ))}
                {data.flagged_results.length > 10 && (
                  <p className="text-sm text-gray-600 text-center pt-2">
                    ... and {data.flagged_results.length - 10} more flagged results
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Comprehensive AI Analysis */}
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-blue-900">
                  <span className="inline-flex items-center gap-2"><Bot size={20} /> AI Comprehensive Analysis</span>
                </h3>
                {comprehensiveAnalysis && (
                  <p className="text-xs text-gray-600 mt-1">
                    Generated {new Date(comprehensiveAnalysis.generated_at).toLocaleString()} •
                    {' '}{comprehensiveAnalysis.panels_analyzed} panels analyzed
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                {comprehensiveAnalysis && (
                  <button
                    onClick={exportToMarkdown}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1.5"><FileHeart size={16} /> Export MD</span>
                  </button>
                )}
                <button
                  onClick={generateComprehensiveAnalysis}
                  disabled={analysisLoading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {analysisLoading ? 'Analyzing...' : comprehensiveAnalysis ? 'Regenerate' : 'Generate Analysis'}
                </button>
              </div>
            </div>

            {analysisError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">Error: {analysisError}</p>
              </div>
            )}

            {!comprehensiveAnalysis && !analysisLoading && (
              <p className="text-gray-700 text-sm">
                Click "Generate Analysis" to get comprehensive AI analysis of all trends, recommendations, and health insights across {data.panels.length} panels.
              </p>
            )}

            {comprehensiveAnalysis && (
              <div className="space-y-6 mt-6">
                {/* Executive Summary */}
                <div className="bg-white rounded-xl p-6">
                  <h4 className="font-semibold text-gray-900 mb-3">Executive Summary</h4>
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {comprehensiveAnalysis.executive_summary}
                  </p>
                </div>

                {/* Priority Actions */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                  <h4 className="font-semibold text-amber-900 mb-3 flex items-center gap-2"><Target size={18} /> Priority Actions</h4>
                  <ul className="space-y-2">
                    {comprehensiveAnalysis.priority_actions.map((action, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold mt-0.5">{idx + 1}.</span>
                        <span className="text-gray-800">{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Category Analyses */}
                {comprehensiveAnalysis.categories
                  .sort((a, b) => {
                    const priorityOrder = { high: 0, medium: 1, low: 2 };
                    return (priorityOrder[a.priority as keyof typeof priorityOrder] || 3) -
                           (priorityOrder[b.priority as keyof typeof priorityOrder] || 3);
                  })
                  .map((category, idx) => (
                  <div key={idx} className="bg-white rounded-xl p-6 border border-gray-200">
                    <div className="flex items-start justify-between mb-4">
                      <h4 className="text-xl font-semibold text-gray-900">{category.name}</h4>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          category.priority === 'high' ? 'bg-red-100 text-red-700' :
                          category.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {category.priority.toUpperCase()} PRIORITY
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          category.overall_trend === 'improving' ? 'bg-green-100 text-green-700' :
                          category.overall_trend === 'worsening' ? 'bg-red-100 text-red-700' :
                          category.overall_trend === 'stable' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          <span className="inline-flex items-center gap-1">{category.overall_trend === 'improving' ? <><TrendingUp size={14} /> IMPROVING</> :
                           category.overall_trend === 'worsening' ? <><TrendingUp size={14} className="rotate-180" /> WORSENING</> :
                           category.overall_trend === 'stable' ? <><ArrowRight size={14} /> STABLE</> :
                           'MIXED'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Trend Analysis</h5>
                        <p className="text-gray-700 leading-relaxed">{category.trend_description}</p>
                      </div>

                      {category.key_findings.length > 0 && (
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Key Findings</h5>
                          <ul className="space-y-1">
                            {category.key_findings.map((finding, i) => (
                              <li key={i} className="flex items-start gap-2 text-gray-700">
                                <span className="text-blue-600 mt-1">•</span>
                                <span>{finding}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Clinical Significance</h5>
                        <p className="text-gray-700 leading-relaxed">{category.clinical_significance}</p>
                      </div>

                      <div className="border-t border-gray-200 pt-4">
                        <h5 className="font-medium text-gray-900 mb-3">Recommendations</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {category.recommendations.dietary.length > 0 && (
                            <div>
                              <h6 className="text-sm font-medium text-gray-700 mb-2">Dietary</h6>
                              <ul className="space-y-1">
                                {category.recommendations.dietary.map((rec, i) => (
                                  <li key={i} className="text-sm text-gray-600 flex items-start gap-1">
                                    <span>•</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {category.recommendations.exercise.length > 0 && (
                            <div>
                              <h6 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5"><Dumbbell size={16} /> Exercise</h6>
                              <ul className="space-y-1">
                                {category.recommendations.exercise.map((rec, i) => (
                                  <li key={i} className="text-sm text-gray-600 flex items-start gap-1">
                                    <span>•</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {category.recommendations.lifestyle.length > 0 && (
                            <div>
                              <h6 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5"><Leaf size={16} /> Lifestyle</h6>
                              <ul className="space-y-1">
                                {category.recommendations.lifestyle.map((rec, i) => (
                                  <li key={i} className="text-sm text-gray-600 flex items-start gap-1">
                                    <span>•</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {category.recommendations.medical.length > 0 && (
                            <div>
                              <h6 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5"><Stethoscope size={16} /> Medical</h6>
                              <ul className="space-y-1">
                                {category.recommendations.medical.map((rec, i) => (
                                  <li key={i} className="text-sm text-gray-600 flex items-start gap-1">
                                    <span>•</span>
                                    <span>{rec}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trends Tab */}
      {activeTab === 'trends' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            Showing trends for key cardiac, kidney, and metabolic markers over time.
          </p>

          {Object.keys(data.key_metrics).length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
              <p className="text-gray-600">
                No key metrics found in your lab panels. Upload more comprehensive lab reports with lipid, kidney, and metabolic panels.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {Object.entries(data.key_metrics).map(([testName, points]) => (
                <div
                  key={testName}
                  className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedTest(testName)}
                >
                  <h3 className="text-lg font-semibold mb-4">{testName}</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={points.map(p => ({
                      date: new Date(p.panel_date).toLocaleDateString(),
                      value: parseFloat(p.value) || 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="text-xs text-gray-500 mt-2">
                    Latest: {points[points.length - 1].value} {points[points.length - 1].unit} ({new Date(points[points.length - 1].panel_date).toLocaleDateString()})
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All Tests Tab */}
      {activeTab === 'tests' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            All {Object.keys(data.test_trends).length} unique tests tracked across your lab panels. Click any test to see detailed trends.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(data.test_trends).map(([testName, points]) => {
              const latest = points[points.length - 1];
              const hasMultiplePoints = points.length > 1;

              return (
                <div
                  key={testName}
                  className="rounded-xl border border-gray-200 bg-white p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedTest(testName)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium text-gray-900 text-sm">{testName}</h4>
                    <span className={`text-xs font-medium ${getFlagColor(latest.flag)}`}>
                      {latest.flag !== 'normal' && `${latest.flag.toUpperCase()}`}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    {latest.value} {latest.unit}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(latest.panel_date).toLocaleDateString()} • {points.length} data points
                  </p>
                  {hasMultiplePoints && (
                    <div className="mt-2 text-xs text-blue-600">
                      Click to view trend →
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Test Detail Modal */}
      {selectedTest && data.test_trends[selectedTest] && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedTest(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedTest}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {data.test_trends[selectedTest].length} measurements from{' '}
                  {new Date(data.test_trends[selectedTest][0].panel_date).toLocaleDateString()} to{' '}
                  {new Date(data.test_trends[selectedTest][data.test_trends[selectedTest].length - 1].panel_date).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setSelectedTest(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Trend Chart */}
            <div className="mb-6">
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.test_trends[selectedTest].map(p => ({
                  date: new Date(p.panel_date).toLocaleDateString(),
                  value: parseFloat(p.value) || 0,
                  fullDate: p.panel_date,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3B82F6"
                    strokeWidth={3}
                    dot={{ r: 6 }}
                    name={`${selectedTest} (${data.test_trends[selectedTest][0].unit})`}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Data Table */}
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Date</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-700">Value</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-700">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {data.test_trends[selectedTest].slice().reverse().map((point, idx) => (
                    <tr key={idx} className="border-t border-gray-100">
                      <td className="py-3 px-4">{new Date(point.panel_date).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {point.value} {point.unit}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getFlagBadgeColor(point.flag)}`}>
                          {point.flag}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* AI Insights Placeholder */}
            <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h4 className="font-semibold text-blue-900 mb-2">AI Insights</h4>
              <p className="text-sm text-gray-700">
                Coming soon: Detailed AI analysis of {selectedTest} trends, clinical significance, and personalized recommendations.
              </p>
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {/* Genetics Reports */}
      {labType === 'methylation' && (
        <div className="space-y-6">
          {methylationLoading ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-gray-600">Loading genetics reports...</p>
            </div>
          ) : methylationReports.length === 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Genetics Reports Found</h3>
              <p className="text-gray-600 mb-4">
                Upload your genetic report PDFs to get AI-powered insights on methylation, neurotransmitters, detox, mitochondria, hormones, and nutrition.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-6 text-xs text-left max-w-lg mx-auto">
                {[
                  ['Methylation & SNP', 'MTHFR, COMT, VDR variants'],
                  ['Neurotransmitter', 'Dopamine, serotonin pathways'],
                  ['Detoxification', 'Phase I & II enzymes'],
                  ['Mitochondrial', 'Energy production genes'],
                  ['Hormone Genetics', 'Estrogen, testosterone, cortisol'],
                  ['Nutritional Genomics', 'Vitamin D, B12, omega-3'],
                ].map(([label, desc]) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-2 border border-slate-200">
                    <p className="font-medium text-slate-800">{label}</p>
                    <p className="text-slate-500">{desc}</p>
                  </div>
                ))}
              </div>
              <a
                href="/fitness/health/upload"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors text-sm"
              >
                <Upload size={18} />
                Upload Genetic Report
              </a>
            </div>
          ) : (
            <div className="space-y-6">
              {/* ── Comprehensive Cross-Report Analysis Card ── */}
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-indigo-100">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Bot className="text-indigo-600" size={20} />
                        <h3 className="text-lg font-bold text-indigo-900">Comprehensive Genetic Profile</h3>
                      </div>
                      <p className="text-sm text-indigo-700">
                        Cross-report AI synthesis across {methylationReports.length} report{methylationReports.length !== 1 ? 's' : ''} — unified recommendations and pattern analysis
                      </p>
                      {comprehensiveGeneticsAnalysis?.generated_at && (
                        <p className="text-xs text-indigo-500 mt-1">
                          Last generated: {new Date(comprehensiveGeneticsAnalysis.generated_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={generateComprehensiveGeneticsAnalysis}
                      disabled={geneticsComprehensiveLoading}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
                    >
                      <RefreshCw size={14} className={geneticsComprehensiveLoading ? 'animate-spin' : ''} />
                      {comprehensiveGeneticsAnalysis ? 'Refresh' : 'Generate'} Analysis
                    </button>
                  </div>
                  {geneticsComprehensiveError && (
                    <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                      {geneticsComprehensiveError}
                    </div>
                  )}
                </div>

                {comprehensiveGeneticsAnalysis?.analysis && (() => {
                  const ca = comprehensiveGeneticsAnalysis.analysis;
                  return (
                    <div className="p-6 space-y-5">
                      {/* Overall Profile */}
                      {ca.overall_genetic_profile && (
                        <p className="text-sm text-slate-700 leading-relaxed">{String(ca.overall_genetic_profile)}</p>
                      )}

                      {/* Cross-Report Patterns */}
                      {Array.isArray(ca.cross_report_patterns) && ca.cross_report_patterns.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <TrendingUp size={13} /> Cross-Report Patterns
                          </h4>
                          <div className="space-y-2">
                            {(ca.cross_report_patterns as Array<{pattern_name?: string; severity?: string; plain_english?: string; genes_involved?: string[]}>).map((p, i) => (
                              <div key={i} className={`rounded-lg p-3 border ${
                                p.severity === 'high' ? 'bg-red-50 border-red-200' :
                                p.severity === 'moderate' ? 'bg-yellow-50 border-yellow-200' :
                                'bg-slate-50 border-slate-200'
                              }`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-sm text-slate-900">{p.pattern_name}</span>
                                  {Array.isArray(p.genes_involved) && (
                                    <span className="text-xs text-slate-500">({p.genes_involved.join(', ')})</span>
                                  )}
                                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                                    p.severity === 'high' ? 'bg-red-100 text-red-700' :
                                    p.severity === 'moderate' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-slate-100 text-slate-700'
                                  }`}>{p.severity}</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">{p.plain_english}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Top Priorities */}
                      {Array.isArray(ca.top_priorities) && ca.top_priorities.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Target size={13} /> Top Priority Actions
                          </h4>
                          <div className="space-y-1.5">
                            {(ca.top_priorities as string[]).map((p, i) => (
                              <div key={i} className="flex items-start gap-2 text-sm">
                                <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px] font-bold">{i + 1}</span>
                                <span className="text-slate-700">{p}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Unified Supplement Plan */}
                      {Array.isArray(ca.unified_supplement_plan) && ca.unified_supplement_plan.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                            <Leaf size={13} /> Unified Supplement Plan
                          </h4>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {(ca.unified_supplement_plan as Array<{supplement?: string; reason?: string; dosage?: string; priority?: string; caution?: string; addresses?: string[]}>).map((s, i) => (
                              <div key={i} className="bg-white rounded-lg p-3 border border-green-100">
                                <div className="flex items-start justify-between mb-1">
                                  <p className="font-medium text-sm text-slate-900">{s.supplement}</p>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    s.priority === 'high' ? 'bg-red-100 text-red-700' :
                                    s.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-slate-100 text-slate-700'
                                  }`}>{s.priority}</span>
                                </div>
                                <p className="text-xs text-slate-600 mb-1">{s.reason}</p>
                                {s.dosage && <p className="text-xs text-slate-400 font-mono">{s.dosage}</p>}
                                {s.caution && <p className="text-xs text-amber-700 mt-1 italic">{s.caution}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Cardiac Genetic Profile */}
                      {ca.cardiac_genetic_profile && (
                        <div className="bg-red-50 rounded-lg p-4 border border-red-100">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Stethoscope size={14} className="text-red-600" />
                            <h4 className="text-xs font-semibold text-red-900 uppercase tracking-wide">Cardiac Genetic Profile</h4>
                          </div>
                          <p className="text-xs text-red-800 leading-relaxed">{String(ca.cardiac_genetic_profile)}</p>
                        </div>
                      )}

                      {/* Things to Discuss with Doctor */}
                      {Array.isArray(ca.things_to_discuss_with_doctor) && ca.things_to_discuss_with_doctor.length > 0 && (
                        <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                          <div className="flex items-center gap-1.5 mb-2">
                            <AlertCircle size={14} className="text-blue-600" />
                            <h4 className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Discuss with Your Doctor</h4>
                          </div>
                          <ul className="space-y-1.5">
                            {(ca.things_to_discuss_with_doctor as string[]).map((item, i) => (
                              <li key={i} className="text-xs text-blue-800 flex items-start gap-1.5">
                                <span className="flex-shrink-0 mt-0.5 h-4 w-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {!comprehensiveGeneticsAnalysis && !geneticsComprehensiveLoading && (
                  <div className="px-6 pb-6">
                    <p className="text-sm text-indigo-600 italic">
                      Click &ldquo;Generate Analysis&rdquo; to create a unified AI synthesis across all your genetic reports.
                    </p>
                  </div>
                )}
              </div>

              {/* ── Individual Report Cards ── */}
              {methylationReports.map((report: GeneticReport) => {
                const isCollapsed = collapsedReports.has(report.file_id);
                const isRefreshing = refreshingReport === report.file_id;

                const reportIcon = (() => {
                  switch (report.file_type) {
                    case 'genetics_neurotransmitter': return <Brain size={16} className="text-purple-600" />;
                    case 'genetics_detox': return <FlaskConical size={16} className="text-green-600" />;
                    case 'genetics_mitochondrial': return <Zap size={16} className="text-yellow-600" />;
                    case 'genetics_hormone': return <Activity size={16} className="text-pink-600" />;
                    case 'genetics_nutrition': return <Leaf size={16} className="text-emerald-600" />;
                    default: return <FileHeart size={16} className="text-blue-600" />;
                  }
                })();

                const headerColor = (() => {
                  switch (report.file_type) {
                    case 'genetics_neurotransmitter': return 'bg-purple-50 border-purple-100';
                    case 'genetics_detox': return 'bg-green-50 border-green-100';
                    case 'genetics_mitochondrial': return 'bg-yellow-50 border-yellow-100';
                    case 'genetics_hormone': return 'bg-pink-50 border-pink-100';
                    case 'genetics_nutrition': return 'bg-emerald-50 border-emerald-100';
                    default: return 'bg-blue-50 border-blue-100';
                  }
                })();

                return (
                <div key={report.file_id} className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                  {/* Collapsible Header */}
                  <div
                    className={`border-b p-5 cursor-pointer select-none ${headerColor}`}
                    onClick={() => toggleCollapsed(report.file_id)}
                  >
                    <div className="flex items-center gap-3">
                      {reportIcon}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-900 text-base leading-tight truncate">{report.file_name}</h3>
                          <span className="text-xs text-slate-500 font-normal flex-shrink-0">{report.file_type_label}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Uploaded {new Date(report.upload_date).toLocaleDateString()}
                          {report.marker_count > 0 && ` • ${report.marker_count} SNPs`}
                          {report.analysis?.generated_at && ` • AI: ${new Date(String(report.analysis.generated_at)).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          report.processing_status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {report.processing_status}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); refreshGeneticReport(report.file_id); }}
                          disabled={isRefreshing}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors min-h-[32px]"
                          title="Refresh AI analysis"
                        >
                          <RefreshCw size={12} className={isRefreshing ? 'animate-spin' : ''} />
                          {isRefreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                        {isCollapsed ? <ChevronRight size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Body */}
                  {!isCollapsed && (
                    <div>
                      {/* AI Analysis */}
                      {report.analysis ? (
                        <div className="p-6 space-y-4">
                          {/* Summary */}
                          {report.analysis.summary && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <Bot size={16} className="text-slate-500" />
                                <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">AI Summary</h4>
                              </div>
                              <p className="text-sm text-slate-700 leading-relaxed">{String(report.analysis.summary)}</p>
                            </div>
                          )}

                          {/* Key Findings */}
                          {Array.isArray(report.analysis.key_findings) && report.analysis.key_findings.length > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <AlertCircle size={13} /> Key Findings
                              </h5>
                              <div className="space-y-2">
                                {(report.analysis.key_findings as Array<{finding?: string; severity?: string; plain_english?: string}>).map((f, i) => (
                                  <div key={i} className={`rounded-lg p-3 border ${
                                    f.severity === 'high' ? 'bg-red-50 border-red-200' :
                                    f.severity === 'moderate' ? 'bg-yellow-50 border-yellow-200' :
                                    'bg-slate-50 border-slate-200'
                                  }`}>
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="font-medium text-sm text-slate-900">{f.finding}</span>
                                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                                        f.severity === 'high' ? 'bg-red-100 text-red-700' :
                                        f.severity === 'moderate' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-slate-100 text-slate-700'
                                      }`}>{f.severity}</span>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-relaxed">{f.plain_english}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Gene Explanations */}
                          {Array.isArray(report.analysis.gene_explanations) && report.analysis.gene_explanations.length > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <FileHeart size={13} /> What Your Genes Mean
                              </h5>
                              <div className="space-y-2">
                                {(report.analysis.gene_explanations as Array<{gene?: string; variant?: string; risk_level?: string; what_it_means?: string; action_items?: string[]}>).map((g, i) => (
                                  <div key={i} className={`bg-white rounded-lg p-3 border ${
                                    g.risk_level === 'high' ? 'border-red-200' :
                                    g.risk_level === 'moderate' ? 'border-yellow-200' :
                                    'border-green-200'
                                  }`}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="font-medium text-sm text-slate-900">{g.gene}</p>
                                      {g.variant && <span className="text-xs text-slate-500">({g.variant})</span>}
                                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                                        g.risk_level === 'high' ? 'bg-red-100 text-red-700' :
                                        g.risk_level === 'moderate' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-green-100 text-green-700'
                                      }`}>{g.risk_level}</span>
                                    </div>
                                    <p className="text-xs text-slate-600 mb-2 leading-relaxed">{g.what_it_means}</p>
                                    {g.action_items && g.action_items.length > 0 && (
                                      <ul className="space-y-1">
                                        {g.action_items.map((item, j) => (
                                          <li key={j} className="text-xs text-slate-500 flex items-start gap-1">
                                            <span className="text-blue-400">→</span><span>{item}</span>
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
                          {Array.isArray(report.analysis.supplement_recommendations) && report.analysis.supplement_recommendations.length > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Leaf size={13} /> Supplements
                              </h5>
                              <div className="grid gap-2 sm:grid-cols-2">
                                {(report.analysis.supplement_recommendations as Array<{supplement?: string; reason?: string; dosage?: string; priority?: string; caution?: string}>).map((s, i) => (
                                  <div key={i} className="bg-white rounded-lg p-3 border border-green-100">
                                    <div className="flex items-start justify-between mb-1">
                                      <p className="font-medium text-sm text-slate-900">{s.supplement}</p>
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        s.priority === 'high' ? 'bg-red-100 text-red-700' :
                                        s.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-slate-100 text-slate-700'
                                      }`}>{s.priority}</span>
                                    </div>
                                    <p className="text-xs text-slate-600 mb-1">{s.reason}</p>
                                    {s.dosage && <p className="text-xs text-slate-400 font-mono">{s.dosage}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Dietary */}
                          {Array.isArray(report.analysis.dietary_recommendations) && report.analysis.dietary_recommendations.length > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Target size={13} /> Dietary Recommendations
                              </h5>
                              <div className="space-y-2">
                                {(report.analysis.dietary_recommendations as Array<{area?: string; recommendation?: string; foods?: string[]}>).map((r, i) => (
                                  <div key={i} className="bg-white rounded-lg p-3 border border-orange-100">
                                    <p className="font-medium text-sm text-slate-900 mb-1">{r.area}</p>
                                    <p className="text-xs text-slate-600 mb-1">{r.recommendation}</p>
                                    {r.foods && r.foods.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {r.foods.map((food, j) => (
                                          <span key={j} className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full border border-orange-100">{food}</span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Lifestyle */}
                          {Array.isArray(report.analysis.lifestyle_recommendations) && report.analysis.lifestyle_recommendations.length > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Dumbbell size={13} /> Lifestyle
                              </h5>
                              <div className="space-y-2">
                                {(report.analysis.lifestyle_recommendations as Array<{area?: string; recommendation?: string}>).map((r, i) => (
                                  <div key={i} className="bg-white rounded-lg p-3 border border-blue-100">
                                    <p className="font-medium text-sm text-slate-900 mb-1">{r.area}</p>
                                    <p className="text-xs text-slate-600">{r.recommendation}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Medication Notes */}
                          {Array.isArray(report.analysis.medication_notes) && report.analysis.medication_notes.length > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <Pill size={13} /> Medication Notes
                              </h5>
                              <div className="space-y-2">
                                {(report.analysis.medication_notes as Array<{medication_or_class?: string; medication?: string; note?: string}>).map((n, i) => (
                                  <div key={i} className="bg-white rounded-lg p-3 border border-purple-100">
                                    <p className="font-medium text-sm text-slate-900 mb-1">{n.medication_or_class || n.medication}</p>
                                    <p className="text-xs text-slate-600">{n.note}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Cardiac */}
                          {report.analysis.cardiac_relevance && (
                            <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Stethoscope size={13} className="text-red-600" />
                                <h5 className="text-xs font-semibold text-red-900 uppercase tracking-wide">Cardiac Relevance</h5>
                              </div>
                              <p className="text-xs text-red-800 leading-relaxed">{String(report.analysis.cardiac_relevance)}</p>
                            </div>
                          )}

                          {/* Doctor Items */}
                          {Array.isArray(report.analysis.things_to_discuss_with_doctor) && report.analysis.things_to_discuss_with_doctor.length > 0 && (
                            <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                              <div className="flex items-center gap-1.5 mb-2">
                                <AlertCircle size={13} className="text-blue-600" />
                                <h5 className="text-xs font-semibold text-blue-900 uppercase tracking-wide">Discuss with Your Doctor</h5>
                              </div>
                              <ul className="space-y-1.5">
                                {(report.analysis.things_to_discuss_with_doctor as string[]).map((item, i) => (
                                  <li key={i} className="text-xs text-blue-800 flex items-start gap-1.5">
                                    <span className="flex-shrink-0 mt-0.5 h-4 w-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">{i + 1}</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* SNP Markers (methylation_report only) */}
                          {report.file_type === 'methylation_report' && Object.keys(report.markers_by_gene).length > 0 && (
                            <div>
                              <h5 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                <FileHeart size={13} /> Genetic Markers (SNPs)
                              </h5>
                              <div className="space-y-3">
                                {Object.entries(report.markers_by_gene).map(([gene, markers]) => (
                                  <div key={gene} className="border border-slate-200 rounded-lg overflow-hidden">
                                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
                                      <h6 className="font-semibold text-slate-900 text-sm">{gene}</h6>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                      {markers.map((marker, i) => (
                                        <div key={i} className="px-4 py-3 hover:bg-slate-50">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-mono text-sm font-medium text-slate-900">{String(marker.snp_id)}</span>
                                            <span className="font-mono text-xs text-slate-600">Genotype: {String(marker.genotype)}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                              marker.risk_level === 'normal' ? 'bg-green-100 text-green-700' :
                                              marker.risk_level === 'moderate' ? 'bg-yellow-100 text-yellow-700' :
                                              'bg-orange-100 text-orange-700'
                                            }`}>{String(marker.risk_level)}</span>
                                          </div>
                                          {marker.clinical_significance && (
                                            <p className="text-xs text-slate-500 mt-1">{String(marker.clinical_significance)}</p>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-6 text-center text-slate-500">
                          <p className="text-sm mb-3">No AI analysis yet for this report.</p>
                          <button
                            onClick={() => refreshGeneticReport(report.file_id)}
                            disabled={isRefreshing}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                            {isRefreshing ? 'Generating...' : 'Generate Analysis'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}

              {/* Upload More CTA */}
              <div className="text-center pt-2">
                <a
                  href="/fitness/health/upload"
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors"
                >
                  <Upload size={16} />
                  Upload More Genetic Reports
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
