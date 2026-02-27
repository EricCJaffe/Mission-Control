'use client';

import { useState, useEffect } from 'react';
import type { Medication, MedicationType } from '@/lib/fitness/types';
import MedicationAIInsights from './MedicationAIInsights';
import SupplementProposal from './SupplementProposal';
import MedicationDetailsModal from './MedicationDetailsModal';

type Props = {
  medications: Medication[];
  regimenReview?: any;
  regimenLastReviewedAt?: string | null;
};

const TYPE_COLORS: Record<MedicationType, string> = {
  prescription: 'bg-blue-100 text-blue-700',
  otc: 'bg-green-100 text-green-700',
  supplement: 'bg-purple-100 text-purple-700',
};

export default function MedicationsClient({
  medications: initial,
  regimenReview: initialReview,
  regimenLastReviewedAt: initialReviewedAt,
}: Props) {
  const [medications, setMedications] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [viewDetailsId, setViewDetailsId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [showSupplementProposal, setShowSupplementProposal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<MedicationType>('prescription');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [timing, setTiming] = useState('');
  const [purpose, setPurpose] = useState('');
  const [interactions, setInteractions] = useState('');
  const [doctor, setDoctor] = useState('');

  function resetForm() {
    setName(''); setType('prescription'); setDosage(''); setFrequency('');
    setTiming(''); setPurpose(''); setInteractions(''); setDoctor('');
    setShowAdd(false); setEditId(null);
  }

  function startEdit(med: Medication) {
    setName(med.name);
    setType(med.type);
    setDosage(med.dosage ?? '');
    setFrequency(med.frequency ?? '');
    setTiming(med.timing ?? '');
    setPurpose(med.purpose ?? '');
    setInteractions(med.known_interactions ?? '');
    setDoctor(med.prescribing_doctor ?? '');
    setEditId(med.id);
    setShowAdd(true);
  }

  async function handleSave() {
    if (!name) return;
    setSaving(true); setError(null);

    const payload = {
      name, type, dosage: dosage || null, frequency: frequency || null,
      timing: timing || null, purpose: purpose || null,
      known_interactions: interactions || null, prescribing_doctor: doctor || null,
    };

    try {
      if (editId) {
        const res = await fetch('/api/fitness/medications', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editId, ...payload }),
        });
        const data = await res.json();
        if (data.ok) {
          setMedications(prev => prev.map(m => m.id === editId ? data.medication : m));
          setRefreshTrigger(prev => prev + 1); // Trigger regimen refresh
        } else {
          setError(data.error || 'Failed to update medication');
        }
      } else {
        const res = await fetch('/api/fitness/medications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok) {
          setMedications(prev => [data.medication, ...prev]);
          setRefreshTrigger(prev => prev + 1); // Trigger regimen refresh
        } else {
          setError(data.error || 'Failed to add medication');
        }
      }
      resetForm();
    } catch { setError('Network error — could not save'); }
    setSaving(false);
  }

  async function handleAddFromProposal(supplement: {
    name: string;
    type: string;
    dosage: string;
    purpose: string;
    ai_review?: any;
  }) {
    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        name: supplement.name,
        type: supplement.type,
        dosage: supplement.dosage,
        purpose: supplement.purpose,
      };

      // Include AI review if available
      if (supplement.ai_review) {
        payload.ai_review = supplement.ai_review;
        payload.last_reviewed_at = new Date().toISOString();
      }

      const res = await fetch('/api/fitness/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setMedications(prev => [data.medication, ...prev]);
        setShowSupplementProposal(false);
        setRefreshTrigger(prev => prev + 1); // Trigger regimen refresh
      } else {
        setError(data.error || 'Failed to add supplement');
      }
    } catch {
      setError('Network error — could not save');
    }
    setSaving(false);
  }

  async function handleToggleActive(med: Medication) {
    setError(null);
    try {
      const res = await fetch('/api/fitness/medications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: med.id, active: !med.active }),
      });
      const data = await res.json();
      if (data.ok) {
        setMedications(prev => prev.map(m => m.id === med.id ? data.medication : m));
        setRefreshTrigger(prev => prev + 1); // Trigger regimen refresh
      } else {
        setError(data.error || 'Failed to update medication');
      }
    } catch { setError('Network error — could not update'); }
  }

  async function handleSeed() {
    setSeeding(true); setError(null);
    try {
      const res = await fetch('/api/fitness/medications/seed', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        // Reload full medication list
        const listRes = await fetch('/api/fitness/medications');
        const listData = await listRes.json();
        if (listData.medications) setMedications(listData.medications);
        else window.location.reload();
      } else {
        setError(data.error || 'Failed to seed medications');
      }
    } catch { setError('Network error — could not seed medications'); }
    setSeeding(false);
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/fitness/medications?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setMedications(prev => prev.filter(m => m.id !== id));
        setConfirmDeleteId(null);
        setRefreshTrigger(prev => prev + 1); // Trigger regimen refresh
      } else { setError(data.error || 'Failed to delete medication'); }
    } catch { setError('Network error — could not delete'); }
  }

  const activeMeds = medications.filter(m => m.active);
  const inactiveMeds = medications.filter(m => !m.active);

  // Separate prescriptions and supplements
  const activePrescriptions = activeMeds.filter(m => m.type === 'prescription' || m.type === 'otc');
  const activeSupplements = activeMeds.filter(m => m.type === 'supplement');

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {/* AI Medication Insights */}
      <MedicationAIInsights
        onTestNewSupplement={() => setShowSupplementProposal(true)}
        savedReview={initialReview}
        lastReviewedAt={initialReviewedAt}
        triggerRefresh={refreshTrigger}
      />

      {/* Supplement Proposal Modal */}
      {showSupplementProposal && (
        <SupplementProposal
          onClose={() => setShowSupplementProposal(false)}
          onAdd={handleAddFromProposal}
        />
      )}

      {/* Add/edit form */}
      {showAdd ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">{editId ? 'Edit Medication' : 'Add Medication'}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Carvedilol" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value as MedicationType)}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full">
                <option value="prescription">Prescription</option>
                <option value="otc">OTC</option>
                <option value="supplement">Supplement</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">Dosage</label>
              <input type="text" value={dosage} onChange={e => setDosage(e.target.value)}
                placeholder="12.5mg" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Frequency</label>
              <input type="text" value={frequency} onChange={e => setFrequency(e.target.value)}
                placeholder="twice daily" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">Timing</label>
              <input type="text" value={timing} onChange={e => setTiming(e.target.value)}
                placeholder="morning, evening" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Purpose</label>
            <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)}
              placeholder="Beta-blocker for heart rate control" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Known Interactions</label>
            <input type="text" value={interactions} onChange={e => setInteractions(e.target.value)}
              placeholder="Avoid NSAIDs, decongestants" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Prescribing Doctor</label>
            <input type="text" value={doctor} onChange={e => setDoctor(e.target.value)}
              placeholder="Dr. Smith" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm w-full" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving || !name}
              className="rounded-xl bg-slate-800 text-white text-sm font-medium px-4 py-2.5 hover:bg-slate-700 disabled:opacity-50 min-h-[44px]">
              {saving ? 'Saving...' : editId ? 'Update' : 'Add Medication'}
            </button>
            <button onClick={resetForm}
              className="rounded-xl border border-slate-200 text-slate-600 text-sm px-4 py-2.5 hover:bg-slate-50 min-h-[44px]">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full rounded-2xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-400 hover:border-slate-400 transition-colors min-h-[44px]">
          + Add Medication or Supplement
        </button>
      )}

      {/* Active Prescriptions */}
      {activePrescriptions.length > 0 && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/30 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-blue-200 bg-white">
            <h2 className="text-sm font-semibold text-slate-800">💊 Prescriptions & OTC ({activePrescriptions.length})</h2>
          </div>
          <div className="divide-y divide-blue-100 bg-white">
            {activePrescriptions.map(med => (
              <div key={med.id} className="px-5 py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{med.name}</p>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${TYPE_COLORS[med.type]}`}>{med.type}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {[med.dosage, med.frequency, med.timing].filter(Boolean).join(' · ')}
                    </p>
                    {med.purpose && <p className="text-xs text-slate-400 mt-0.5">{med.purpose}</p>}
                    {med.known_interactions && (
                      <p className="text-xs text-amber-600 mt-0.5">Interactions: {med.known_interactions}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setViewDetailsId(med.id)}
                      className="text-xs text-blue-500 hover:text-blue-600 px-2 py-1 min-h-[32px]">Details</button>
                    <button onClick={() => startEdit(med)}
                      className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 min-h-[32px]">Edit</button>
                    <button onClick={() => handleToggleActive(med)}
                      className="text-xs text-amber-500 hover:text-amber-600 px-2 py-1 min-h-[32px]">Stop</button>
                    {confirmDeleteId === med.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(med.id)} className="text-xs text-red-600 px-1">Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-400 px-1">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(med.id)}
                        className="text-xs text-slate-300 hover:text-red-400 px-2 py-1 min-h-[32px]">Del</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Supplements/Vitamins */}
      {activeSupplements.length > 0 && (
        <div className="rounded-2xl border border-purple-200 bg-purple-50/30 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-purple-200 bg-white">
            <h2 className="text-sm font-semibold text-slate-800">🌿 Supplements & Vitamins ({activeSupplements.length})</h2>
          </div>
          <div className="divide-y divide-purple-100 bg-white">
            {activeSupplements.map(med => (
              <div key={med.id} className="px-5 py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{med.name}</p>
                      <span className={`text-xs rounded-full px-2 py-0.5 ${TYPE_COLORS[med.type]}`}>{med.type}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {[med.dosage, med.frequency, med.timing].filter(Boolean).join(' · ')}
                    </p>
                    {med.purpose && <p className="text-xs text-slate-600 mt-1">{med.purpose}</p>}
                    {med.known_interactions && <p className="text-xs text-amber-600 mt-1">⚠️ {med.known_interactions}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setViewDetailsId(med.id)}
                      className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-100 min-h-[36px]">
                      View Details
                    </button>
                    <button onClick={() => startEdit(med)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 min-h-[36px]">
                      Edit
                    </button>
                    <button onClick={() => handleToggleActive(med)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 min-h-[36px]">
                      Deactivate
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {medications.length === 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm space-y-4">
          <p className="text-slate-500 text-sm">No medications tracked yet. Add your prescriptions and supplements for AI-aware training guidance.</p>
          <button onClick={handleSeed} disabled={seeding}
            className="rounded-xl bg-blue-700 text-white text-sm font-medium px-5 py-2.5 hover:bg-blue-600 disabled:opacity-50 min-h-[44px]">
            {seeding ? 'Loading medications...' : 'Load Current Medications & Supplements'}
          </button>
          <p className="text-xs text-slate-400">Seeds your 5 prescriptions and 4 supplements from your cardiac care regimen</p>
        </div>
      )}

      {/* Inactive medications */}
      {inactiveMeds.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden opacity-60">
          <div className="px-5 py-3 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-500">Inactive ({inactiveMeds.length})</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {inactiveMeds.map(med => (
              <div key={med.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">{med.name} <span className="text-xs text-slate-400">{med.dosage}</span></p>
                  {med.end_date && <p className="text-xs text-slate-400">Stopped: {med.end_date}</p>}
                </div>
                <button onClick={() => handleToggleActive(med)}
                  className="text-xs text-blue-500 hover:text-blue-600 px-2 py-1 min-h-[32px]">Reactivate</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Medication Details Modal */}
      {viewDetailsId && (
        <MedicationDetailsModal
          medication={medications.find(m => m.id === viewDetailsId)!}
          onClose={() => setViewDetailsId(null)}
          onUpdate={(updatedMed) => {
            setMedications(prev => prev.map(m => m.id === updatedMed.id ? updatedMed : m));
          }}
        />
      )}
    </div>
  );
}
