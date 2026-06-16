'use client';

import React, { useState } from 'react';
import { PendingJob, Analyst, Instrument } from '@/lib/supabase';

interface ForceBindFormProps {
  jobs: PendingJob[];
  analysts: Analyst[];
  instruments: Instrument[];
  isDarkMode: boolean;
  onBind: (data: { jobId: string; analystCode: string; instrumentId: string; reason: string }) => void;
}

export default function ForceBindForm({ jobs, analysts, instruments, isDarkMode, onBind }: ForceBindFormProps) {
  const [selectedJobId, setSelectedJobId] = useState('');
  const [targetAnalystCode, setTargetAnalystCode] = useState('');
  const [targetInstrumentId, setTargetInstrumentId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !overrideReason) return;
    onBind({ jobId: selectedJobId, analystCode: targetAnalystCode, instrumentId: targetInstrumentId, reason: overrideReason });
    setSelectedJobId(''); setTargetAnalystCode(''); setTargetInstrumentId(''); setOverrideReason('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-slate-300 dark:border-white/[0.06]">
      <h4 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-400">🔗 Manual Assignment: Force-Bind Person & Machine</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <select required value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} className={`p-3 text-sm font-bold rounded-xl focus:outline-none border ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-purple-400' : 'bg-white border-slate-400 text-slate-900'}`}>
          <option value="">-- CHOOSE WAITING SAMPLE --</option>
          {jobs.filter(j => !j.allocated_analyst_code && !j.allocated_instrument_id && j.status !== 'COMPLETED').map(j => (
            <option key={j.id} value={j.id}>{j.source_system_ref} ({j.batch_lot_number})</option>
          ))}
        </select>
        <select value={targetAnalystCode} onChange={(e) => setTargetAnalystCode(e.target.value)} className={`p-3 text-sm rounded-xl focus:outline-none border font-semibold ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900'}`}>
          <option value="">-- ASSIGN TECHNICIAN STAFF --</option>
          {analysts.filter(a => a.is_available_today).map(a => (
            <option key={a.employee_code} value={a.employee_code}>{a.full_name}</option>
          ))}
        </select>
        <select value={targetInstrumentId} onChange={(e) => setTargetInstrumentId(e.target.value)} className={`p-3 text-sm rounded-xl focus:outline-none border font-semibold ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900'}`}>
          <option value="">-- ASSIGN INSTRUMENT UNIT --</option>
          {instruments.filter(i => i.status === 'AVAILABLE').map(i => (
            <option key={i.instrument_serial_id} value={i.instrument_serial_id}>{i.model_make}</option>
          ))}
        </select>
      </div>
      <input type="text" required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Provide compliance tracking note detailing reason for manual assignment..." className={`w-full p-3.5 text-sm rounded-xl focus:outline-none border font-medium ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900'}`} />
      <button type="submit" className="px-5 py-3 bg-slate-900 text-white dark:bg-white dark:text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:opacity-90 transition-all shadow-sm">Save Specific Assignment Lock</button>
    </form>
  );
}