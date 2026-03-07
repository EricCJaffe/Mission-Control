import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';

type ImagingUpload = {
  id: string;
  file_name: string;
  created_at: string;
  processed_at: string | null;
  analysis_json: {
    study_title?: string;
    modality?: string;
    summary?: string;
    impression?: string;
    key_findings?: Array<{
      finding: string;
      severity: string;
      significance: string;
    }>;
    appointment_questions?: string[];
  } | null;
};

export const dynamic = 'force-dynamic';

export default async function ImagingReportsPage() {
  const supabase = await supabaseServer();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect('/login');
  }

  const { data: reports } = await supabase
    .from('health_file_uploads')
    .select('id, file_name, created_at, processed_at, analysis_json')
    .eq('user_id', userData.user.id)
    .eq('file_type', 'imaging')
    .eq('processing_status', 'completed')
    .order('created_at', { ascending: false });

  const imagingReports = (reports || []) as ImagingUpload[];

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="mb-2 text-2xl font-bold">Imaging Reports</h1>
        <p className="text-gray-600">
          AI analysis for one-off imaging studies such as cardiac MRI, echo, CT, or other major diagnostic reports.
        </p>
      </div>

      {imagingReports.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
          <p className="text-sm text-slate-600">No imaging analyses saved yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {imagingReports.map((report) => (
            <div key={report.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-slate-900">
                  {report.analysis_json?.study_title || report.file_name}
                </h2>
                <p className="text-sm text-slate-500">
                  {report.analysis_json?.modality || 'Imaging'} • Saved {new Date(report.created_at).toLocaleDateString()}
                </p>
              </div>

              {report.analysis_json?.summary && (
                <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <h3 className="mb-2 font-semibold text-blue-900">Summary</h3>
                  <p className="text-sm leading-relaxed text-slate-700">{report.analysis_json.summary}</p>
                </div>
              )}

              {report.analysis_json?.impression && (
                <div className="mb-4">
                  <h3 className="mb-2 font-semibold text-slate-900">Impression</h3>
                  <p className="text-sm leading-relaxed text-slate-700">{report.analysis_json.impression}</p>
                </div>
              )}

              {report.analysis_json?.key_findings && report.analysis_json.key_findings.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-2 font-semibold text-slate-900">Key Findings</h3>
                  <div className="space-y-3">
                    {report.analysis_json.key_findings.map((finding, idx) => (
                      <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-medium text-slate-900">{finding.finding}</span>
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                            {finding.severity}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600">{finding.significance}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {report.analysis_json?.appointment_questions && report.analysis_json.appointment_questions.length > 0 && (
                <div>
                  <h3 className="mb-2 font-semibold text-slate-900">Cardiology Follow-Up Questions</h3>
                  <ul className="space-y-2 text-sm text-slate-700">
                    {report.analysis_json.appointment_questions.map((question, idx) => (
                      <li key={idx}>• {question}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
