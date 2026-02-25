'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Appointment, SuggestedQuestion, ChangeSinceLastVisit } from '@/lib/fitness/types';

type Props = {
  appointments: Appointment[];
};

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
};

export default function AppointmentsClient({ appointments: initial }: Props) {
  const router = useRouter();
  const [appointments, setAppointments] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [date, setDate] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [specialty, setSpecialty] = useState('cardiologist');
  const [notes, setNotes] = useState('');

  const selected = appointments.find(a => a.id === selectedId) ?? null;

  async function handleAdd() {
    if (!date) return;
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/fitness/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_date: date,
          doctor_name: doctorName || null,
          doctor_specialty: specialty,
          user_notes: notes || null,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setAppointments(prev => [data.appointment, ...prev]);
        setShowAdd(false);
        setDate(''); setDoctorName(''); setNotes('');
      } else { setError(data.error || 'Failed to create appointment'); }
    } catch { setError('Network error — could not save'); }
    setSaving(false);
  }

  async function handleGeneratePrep(id: string) {
    setGenerating(true); setError(null);
    try {
      const res = await fetch('/api/fitness/appointments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, generate_prep: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setAppointments(prev => prev.map(a => a.id === id ? data.appointment : a));
        setSelectedId(id);
      } else { setError(data.error || 'Failed to generate prep'); }
    } catch { setError('Network error — could not generate prep'); }
    setGenerating(false);
  }

  async function handleComplete(id: string, apptNotes: string) {
    setError(null);
    try {
      const res = await fetch('/api/fitness/appointments', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'completed', appointment_notes: apptNotes }),
      });
      const data = await res.json();
      if (data.ok) {
        setAppointments(prev => prev.map(a => a.id === id ? data.appointment : a));
      } else { setError(data.error || 'Failed to update appointment'); }
    } catch { setError('Network error — could not update'); }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/fitness/appointments?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setAppointments(prev => prev.filter(a => a.id !== id));
        if (selectedId === id) setSelectedId(null);
      } else { setError(data.error || 'Failed to delete appointment'); }
    } catch { setError('Network error — could not delete'); }
  }

  // Detail view
  if (selected) {
    return (
      <AppointmentDetail
        appointment={selected}
        onBack={() => setSelectedId(null)}
        onGeneratePrep={() => handleGeneratePrep(selected.id)}
        onComplete={(apptNotes) => handleComplete(selected.id, apptNotes)}
        onDelete={() => handleDelete(selected.id)}
        generating={generating}
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* Add appointment */}
      {showAdd ? (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Schedule Appointment</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Specialty</label>
              <select value={specialty} onChange={e => setSpecialty(e.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full">
                <option value="cardiologist">Cardiologist</option>
                <option value="primary_care">Primary Care</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Doctor Name</label>
            <input type="text" value={doctorName} onChange={e => setDoctorName(e.target.value)}
              placeholder="Dr. Smith" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="Reason for visit..." className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !date}
              className="rounded-xl bg-slate-800 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-700 disabled:opacity-50 min-h-[44px]">
              {saving ? 'Saving...' : 'Add Appointment'}
            </button>
            <button onClick={() => setShowAdd(false)}
              className="rounded-xl border border-slate-200 text-slate-600 text-sm px-4 py-2.5 hover:bg-slate-50 min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 hover:border-slate-400 transition-colors min-h-[44px]">
          + Schedule New Appointment
        </button>
      )}

      {/* Appointment list */}
      {appointments.length === 0 ? (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-8 text-center shadow-sm">
          <p className="text-slate-500 text-sm">No appointments yet. Schedule your first appointment to start tracking.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {appointments.map(appt => {
            const isPast = new Date(appt.appointment_date) < new Date(new Date().toISOString().slice(0, 10));
            return (
              <button
                key={appt.id}
                onClick={() => setSelectedId(appt.id)}
                className="w-full text-left rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm hover:bg-white/90 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {appt.doctor_name || appt.doctor_specialty}
                      <span className="ml-2 text-xs text-slate-400 capitalize">{appt.doctor_specialty}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(appt.appointment_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                    appt.status === 'completed' ? 'bg-green-100 text-green-700' :
                    appt.status === 'prep_ready' ? 'bg-blue-100 text-blue-700' :
                    isPast ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {appt.status === 'completed' ? 'Done' :
                     appt.status === 'prep_ready' ? 'Prep Ready' :
                     isPast ? 'Needs Notes' :
                     'Upcoming'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AppointmentDetail({ appointment, onBack, onGeneratePrep, onComplete, onDelete, generating }: {
  appointment: Appointment;
  onBack: () => void;
  onGeneratePrep: () => void;
  onComplete: (notes: string) => void;
  onDelete: () => void;
  generating: boolean;
}) {
  const [apptNotes, setApptNotes] = useState(appointment.appointment_notes ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const questions = appointment.suggested_questions as SuggestedQuestion[] | null;
  const changes = appointment.changes_summary as ChangeSinceLastVisit[] | null;
  const flags = appointment.flags as string[] | null;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-600">← Back to appointments</button>

      <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{appointment.doctor_name || appointment.doctor_specialty}</h2>
            <p className="text-sm text-slate-500 capitalize">{appointment.doctor_specialty}</p>
            <p className="text-sm text-slate-500 mt-1">
              {new Date(appointment.appointment_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${
            appointment.status === 'completed' ? 'bg-green-100 text-green-700' :
            appointment.status === 'prep_ready' ? 'bg-blue-100 text-blue-700' :
            'bg-slate-100 text-slate-600'
          }`}>
            {appointment.status === 'completed' ? 'Completed' : appointment.status === 'prep_ready' ? 'Prep Ready' : 'Upcoming'}
          </span>
        </div>
      </div>

      {/* Generate Prep button */}
      {appointment.status !== 'completed' && (
        <button onClick={onGeneratePrep} disabled={generating}
          className="w-full rounded-xl bg-blue-600 text-white text-sm font-semibold py-3 hover:bg-blue-700 disabled:opacity-50 min-h-[44px]">
          {generating ? 'Generating Prep...' : appointment.status === 'prep_ready' ? 'Regenerate Prep' : 'Generate Appointment Prep'}
        </button>
      )}

      {/* Suggested Questions */}
      {questions && questions.length > 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Questions to Ask</h3>
          <div className="space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="border-l-2 border-slate-200 pl-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${PRIORITY_BADGE[q.priority] ?? PRIORITY_BADGE.low}`}>
                    {q.priority}
                  </span>
                  <span className="text-xs text-slate-400 capitalize">{q.category}</span>
                </div>
                <p className="text-sm text-slate-800 font-medium">{q.question}</p>
                <p className="text-xs text-slate-500 mt-0.5">{q.context}</p>
                {q.data_point && <p className="text-xs text-blue-600 mt-0.5 font-mono">{q.data_point}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Changes Since Last Visit */}
      {changes && changes.length > 0 && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Changes Since Last Visit</h3>
          <div className="space-y-2">
            {changes.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-slate-700">{c.metric}</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{c.previous_value}</span>
                  <span className={`font-medium ${c.trend === 'improved' ? 'text-green-600' : c.trend === 'worsened' ? 'text-red-600' : 'text-slate-600'}`}>
                    → {c.current_value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flags */}
      {flags && flags.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-800 mb-2">Things to Mention</h3>
          <ul className="space-y-1">
            {flags.map((f, i) => (
              <li key={i} className="text-sm text-amber-700">• {f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Post-Appointment Notes */}
      <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">
          {appointment.status === 'completed' ? 'Appointment Notes' : 'Post-Appointment Notes'}
        </h3>
        <textarea value={apptNotes} onChange={e => setApptNotes(e.target.value)} rows={4}
          placeholder="What was discussed? Any medication changes? Next steps?"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full" />
        {appointment.status !== 'completed' && (
          <button onClick={() => onComplete(apptNotes)}
            className="rounded-xl bg-green-700 text-white text-sm font-medium px-4 py-2.5 hover:bg-green-800 min-h-[44px]">
            Mark Completed
          </button>
        )}
      </div>

      {/* User notes */}
      {appointment.user_notes && (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Your Notes</h3>
          <p className="text-sm text-slate-700">{appointment.user_notes}</p>
        </div>
      )}

      {/* Delete */}
      <div className="pt-2">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-red-600">Delete this appointment?</span>
            <button onClick={onDelete} className="text-sm font-medium text-red-600 hover:text-red-700">Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} className="text-sm text-slate-500 hover:text-slate-600">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-slate-400 hover:text-red-500">Delete appointment</button>
        )}
      </div>
    </div>
  );
}
