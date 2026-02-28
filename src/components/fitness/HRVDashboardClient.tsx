'use client';

import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';

interface HRVData {
  metric_date: string;
  hrv_ms: number;
}

interface AIInsight {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

interface Props {
  hrvData: HRVData[];
  savedInsight: AIInsight | null;
}

export default function HRVDashboardClient({ hrvData, savedInsight }: Props) {
  const [generating, setGenerating] = useState(false);
  const [insight, setInsight] = useState<AIInsight | null>(savedInsight);

  // Calculate statistics
  const values = hrvData.map(d => d.hrv_ms);
  const avg = values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;

  // Calculate trend (last 7 days vs previous 7 days)
  const recent7 = values.slice(-7);
  const previous7 = values.slice(-14, -7);
  const recentAvg = recent7.length > 0 ? recent7.reduce((a, b) => a + b, 0) / recent7.length : 0;
  const previousAvg = previous7.length > 0 ? previous7.reduce((a, b) => a + b, 0) / previous7.length : 0;
  const trend = recentAvg - previousAvg;

  const trendIcon = trend > 2 ? <TrendingUp className="h-5 w-5 text-green-600" /> :
                    trend < -2 ? <TrendingDown className="h-5 w-5 text-red-600" /> :
                    <Minus className="h-5 w-5 text-slate-600" />;
  const trendText = trend > 2 ? 'Improving' : trend < -2 ? 'Declining' : 'Stable';
  const trendColor = trend > 2 ? 'text-green-700' : trend < -2 ? 'text-red-700' : 'text-slate-700';

  // Prepare chart data
  const chartData = hrvData.map(d => ({
    date: new Date(d.metric_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    hrv: d.hrv_ms,
  }));

  const handleGenerateInsight = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/fitness/insights/hrv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hrvData: hrvData.slice(-30), // Last 30 days
          stats: { avg, min, max, trend },
        }),
      });

      if (!response.ok) throw new Error('Failed to generate insight');

      const data = await response.json();
      setInsight(data.insight);
    } catch (error) {
      console.error('Error generating insight:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">Current (7-day avg)</p>
          <p className="text-3xl font-bold text-slate-900">{Math.round(recentAvg)}</p>
          <p className="text-xs text-slate-500 mt-1">ms</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">90-Day Average</p>
          <p className="text-3xl font-bold text-slate-900">{avg}</p>
          <p className="text-xs text-slate-500 mt-1">ms</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500 mb-1">Range</p>
          <p className="text-3xl font-bold text-slate-900">{min}–{max}</p>
          <p className="text-xs text-slate-500 mt-1">ms</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            {trendIcon}
            <p className="text-sm text-slate-500">7-Day Trend</p>
          </div>
          <p className={`text-3xl font-bold ${trendColor}`}>{trendText}</p>
          <p className="text-xs text-slate-500 mt-1">
            {trend > 0 ? '+' : ''}{trend.toFixed(1)} ms
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">90-Day Trend</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                stroke="#94a3b8"
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 12 }}
                stroke="#94a3b8"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                }}
              />
              <ReferenceLine y={50} stroke="#10b981" strokeDasharray="3 3" label="Good" />
              <ReferenceLine y={30} stroke="#f59e0b" strokeDasharray="3 3" label="Fair" />
              <Line
                type="monotone"
                dataKey="hrv"
                stroke="#8b5cf6"
                strokeWidth={3}
                dot={{ fill: '#8b5cf6', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-500">
            No HRV data available
          </div>
        )}
      </div>

      {/* AI Insights */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold">AI Insights & Recommendations</h2>
          </div>
          <button
            onClick={handleGenerateInsight}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : insight ? 'Refresh Insights' : 'Generate Insights'}
          </button>
        </div>

        {insight ? (
          <div className="space-y-3">
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
              <h3 className="font-semibold text-purple-900 mb-2">{insight.title}</h3>
              <div className="text-sm text-purple-800 whitespace-pre-line">{insight.content}</div>
              <p className="text-xs text-purple-600 mt-3">
                Generated {new Date(insight.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Sparkles className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 mb-4">
              Get personalized insights and recommendations based on your HRV trends
            </p>
            <button
              onClick={handleGenerateInsight}
              disabled={generating}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:bg-slate-300 transition-colors"
            >
              {generating ? 'Generating...' : 'Generate AI Insights'}
            </button>
          </div>
        )}
      </div>

      {/* Context Info */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h3 className="font-semibold text-blue-900 mb-2">About Heart Rate Variability</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Higher is better:</strong> More variability indicates better recovery and parasympathetic activity</li>
          <li>• <strong>Good:</strong> 50+ ms (varies by age and fitness level)</li>
          <li>• <strong>Fair:</strong> 30-50 ms</li>
          <li>• <strong>Low:</strong> Below 30 ms (may indicate stress, fatigue, or poor recovery)</li>
          <li>• Best measured in the morning before getting out of bed</li>
          <li>• Declining HRV may signal overtraining, illness, or chronic stress</li>
          <li>• HRV responds to sleep quality, stress management, and recovery practices</li>
        </ul>
      </div>
    </div>
  );
}
