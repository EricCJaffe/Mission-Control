'use client';

import { useState } from 'react';

type EquipmentItem = {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  purchase_date: string | null;
  max_distance_miles: number | null;
  total_distance_miles: number;
  status: 'active' | 'retired' | 'maintenance';
};

const ICONS: Record<string, string> = { shoes: '👟', bike: '🚴', trainer: '🏋️', other: '🔧' };

export default function EquipmentClient({ items: initial }: { items: EquipmentItem[] }) {
  const [items, setItems] = useState(initial);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form
  const [name, setName] = useState('');
  const [type, setType] = useState('shoes');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [maxMiles, setMaxMiles] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');

  // Edit form
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('shoes');
  const [editBrand, setEditBrand] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editMaxMiles, setEditMaxMiles] = useState('');
  const [editTotalMiles, setEditTotalMiles] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'retired' | 'maintenance'>('active');

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/fitness/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, brand: brand || null, model: model || null, max_distance_miles: maxMiles || null, purchase_date: purchaseDate || null }),
      });
      const data = await res.json();
      if (data.ok) {
        setItems(prev => [...prev, data.item]);
        setName(''); setBrand(''); setModel(''); setMaxMiles(''); setPurchaseDate('');
        setShowAdd(false);
      }
    } catch (err) {
      console.error('Failed to add equipment', err);
    }
    setSaving(false);
  }

  function startEdit(item: EquipmentItem) {
    setEditingId(item.id);
    setEditName(item.name);
    setEditType(item.type);
    setEditBrand(item.brand || '');
    setEditModel(item.model || '');
    setEditMaxMiles(item.max_distance_miles?.toString() || '');
    setEditTotalMiles(item.total_distance_miles.toString());
    setEditStatus(item.status);
  }

  async function handleUpdate() {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch('/api/fitness/equipment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingId, name: editName, type: editType, brand: editBrand || null,
          model: editModel || null, max_distance_miles: editMaxMiles || null,
          total_distance_miles: editTotalMiles, status: editStatus,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setItems(prev => prev.map(i => i.id === editingId ? data.item : i));
        setEditingId(null);
      }
    } catch (err) {
      console.error('Failed to update equipment', err);
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/fitness/equipment?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.ok) {
        setItems(prev => prev.filter(i => i.id !== id));
        setConfirmDeleteId(null);
      }
    } catch (err) {
      console.error('Failed to delete equipment', err);
    }
  }

  async function handleRetire(item: EquipmentItem) {
    const newStatus = item.status === 'retired' ? 'active' : 'retired';
    try {
      const res = await fetch('/api/fitness/equipment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status: newStatus }),
      });
      const data = await res.json();
      if (data.ok) {
        setItems(prev => prev.map(i => i.id === item.id ? data.item : i));
      }
    } catch (err) {
      console.error('Failed to update equipment status', err);
    }
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      {showAdd ? (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Add Equipment</h2>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Brooks Ghost 15"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm w-full" />
          <div className="grid grid-cols-2 gap-3">
            <select value={type} onChange={e => setType(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <option value="shoes">Shoes</option>
              <option value="bike">Bike</option>
              <option value="trainer">Trainer</option>
              <option value="other">Other</option>
            </select>
            <input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand (optional)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input value={maxMiles} onChange={e => setMaxMiles(e.target.value)} type="number" placeholder="Max miles (e.g. 450)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            <input value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} type="date"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving || !name.trim()}
              className="rounded-xl bg-slate-800 text-white text-sm font-semibold px-4 py-2.5 hover:bg-slate-700 disabled:opacity-50 min-h-[44px]">
              {saving ? 'Saving...' : 'Add Equipment'}
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
          + Add Equipment
        </button>
      )}

      {/* Equipment list */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-white/80 bg-white/70 p-8 text-center shadow-sm">
          <p className="text-slate-500 text-sm">No equipment tracked yet. Add your shoes and bikes to track mileage and get replacement alerts.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map(item => {
            const pct = item.max_distance_miles
              ? Math.min(100, Math.round((item.total_distance_miles / item.max_distance_miles) * 100))
              : null;
            const nearingLimit = pct != null && pct >= 80;

            if (editingId === item.id) {
              return (
                <div key={item.id} className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm space-y-3">
                  <h3 className="text-xs font-semibold text-blue-600">Editing Equipment</h3>
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm w-full" />
                  <div className="grid grid-cols-3 gap-2">
                    <select value={editType} onChange={e => setEditType(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                      <option value="shoes">Shoes</option>
                      <option value="bike">Bike</option>
                      <option value="trainer">Trainer</option>
                      <option value="other">Other</option>
                    </select>
                    <input value={editBrand} onChange={e => setEditBrand(e.target.value)} placeholder="Brand" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                    <select value={editStatus} onChange={e => setEditStatus(e.target.value as 'active' | 'retired' | 'maintenance')} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                      <option value="active">Active</option>
                      <option value="retired">Retired</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Total Miles</label>
                      <input value={editTotalMiles} onChange={e => setEditTotalMiles(e.target.value)} type="number" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm w-full" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Max Miles</label>
                      <input value={editMaxMiles} onChange={e => setEditMaxMiles(e.target.value)} type="number" className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm w-full" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleUpdate} disabled={saving} className="text-xs font-medium text-blue-600 hover:text-blue-800">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                  </div>
                </div>
              );
            }

            return (
              <div key={item.id} className="rounded-2xl border border-white/80 bg-white/70 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{ICONS[item.type] ?? '⚙️'}</span>
                    <div>
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      {(item.brand || item.model) && (
                        <p className="text-xs text-slate-500">{[item.brand, item.model].filter(Boolean).join(' ')}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                      item.status === 'active' ? 'bg-green-100 text-green-800' :
                      item.status === 'retired' ? 'bg-slate-100 text-slate-500' :
                      'bg-orange-100 text-orange-800'
                    }`}>{item.status}</span>
                  </div>
                </div>

                {item.max_distance_miles != null && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>{item.total_distance_miles.toFixed(0)} mi</span>
                      <span className={nearingLimit ? 'text-orange-600 font-medium' : ''}>
                        {item.max_distance_miles} mi limit{nearingLimit ? ' ⚠️' : ''}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200">
                      <div
                        className={`h-1.5 rounded-full ${pct! >= 90 ? 'bg-red-500' : pct! >= 80 ? 'bg-orange-400' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-2 border-t border-slate-100 flex gap-3 justify-end">
                  <button onClick={() => startEdit(item)} className="text-xs text-slate-400 hover:text-blue-500">Edit</button>
                  <button onClick={() => handleRetire(item)} className="text-xs text-slate-400 hover:text-orange-500">
                    {item.status === 'retired' ? 'Reactivate' : 'Retire'}
                  </button>
                  {confirmDeleteId === item.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-600">Delete?</span>
                      <button onClick={() => handleDelete(item.id)} className="text-xs text-red-600 font-medium">Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-slate-400">No</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(item.id)} className="text-xs text-slate-400 hover:text-red-500">Delete</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
