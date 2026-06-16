'use client';

import React, { useState } from 'react';
import { Material } from '@/lib/supabase';

interface SampleFormProps {
  materials: Material[];
  isDarkMode: boolean;
  onSubmit: (data: { sysRef: string; batchLot: string; matCode: string; urgency: number }) => void;
}

export default function SampleForm({ materials, isDarkMode, onSubmit }: SampleFormProps) {
  const [newSysRef, setNewSysRef] = useState('');
  const [newBatchLot, setNewBatchLot] = useState('');
  const [newMatCode, setNewMatCode] = useState('');
  const [newUrgencyScore, setNewUrgencyScore] = useState('50');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      sysRef: newSysRef,
      batchLot: newBatchLot,
      matCode: newMatCode,
      urgency: parseInt(newUrgencyScore) || 50
    });
    setNewSysRef(''); setNewBatchLot(''); setNewMatCode('');
  };

  return (
    <form onSubmit={handleSubmit} className={`p-6 border rounded-2xl space-y-4 ${isDarkMode ? 'bg-black/20 border-white/[0.06]' : 'bg-slate-100 border-slate-300'}`}>
      <h4 className="text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-400">➕ Form: Register and Inject an Incoming Material Sample</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">System Ref Name</label>
          <input type="text" required value={newSysRef} onChange={(e) => setNewSysRef(e.target.value)} placeholder="e.g. SMPL-902" className={`w-full p-3 text-sm rounded-lg border focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900 font-medium'}`} />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Batch Lot Number</label>
          <input type="text" required value={newBatchLot} onChange={(e) => setNewBatchLot(e.target.value)} placeholder="e.g. LOT-402X" className={`w-full p-3 text-sm rounded-lg border focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900 font-medium'}`} />
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Material Catalog Code</label>
          <select required value={newMatCode} onChange={(e) => setNewMatCode(e.target.value)} className={`w-full p-3 text-sm rounded-lg border focus:outline-none font-medium ${isDarkMode ? 'bg-[#0e1017] border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900'}`}>
            <option value="">-- SELECT MATERIAL --</option>
            {materials.map(m => <option key={m.material_code} value={m.material_code}>{m.material_code}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Urgency Score (1-100)</label>
          <input type="number" min="1" max="100" value={newUrgencyScore} onChange={(e) => setNewUrgencyScore(e.target.value)} className={`w-full p-3 text-sm rounded-lg border focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900 font-medium'}`} />
        </div>
      </div>
      <button type="submit" className="px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm">Submit and Save Sample Into Queue</button>
    </form>
  );
}