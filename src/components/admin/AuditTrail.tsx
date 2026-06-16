'use client';
import React from 'react';
import { PendingJob } from '@/lib/supabase';

interface AuditTrailProps {
  jobs: PendingJob[];
  isDarkMode: boolean;
}

export default function AuditTrail({ jobs, isDarkMode }: AuditTrailProps) {
  const logs = jobs.filter(j => j.priority_justification_reason);

  return (
    <div className="pt-4 border-t border-slate-300 dark:border-white/[0.06] space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-400">📜 Security & History Log (Audit Trail)</h4>
        <span className="text-[10px] font-mono bg-slate-200 dark:bg-white/5 border border-slate-400 dark:border-white/10 px-2 py-0.5 rounded text-slate-700 dark:text-slate-400 font-bold">21 CFR COMPLIANT</span>
      </div>
      
      <div className={`max-h-[180px] overflow-y-auto rounded-xl p-4 font-mono text-xs space-y-3 custom-scrollbar border ${isDarkMode ? 'bg-black/10 border-white/[0.06]' : 'border-slate-400 bg-slate-100 text-slate-900'}`}>
        {logs.map((job, idx) => (
          <div key={idx} className="border-b border-slate-300 dark:border-white/[0.04] pb-3 last:border-0 last:pb-0 text-slate-600 dark:text-slate-400">
            <div className="flex justify-between items-center font-bold text-[11px]">
              <span className={isDarkMode ? 'text-purple-400' : 'text-purple-700'}>SAMPLE CODE: {job.source_system_ref}</span>
              <span className="text-slate-500">{new Date(job.arrival_timestamp).toLocaleTimeString()}</span>
            </div>
            <p className={`mt-1 font-sans text-xs font-medium ${isDarkMode ? 'text-neutral-200' : 'text-slate-900'}`}>Log entry detail: {job.priority_justification_reason}</p>
          </div>
        ))}
        {logs.length === 0 && (
          <div className="text-center text-slate-400 italic py-4 font-sans font-medium">No override actions or exception notes recorded in database storage lines.</div>
        )}
      </div>
    </div>
  );
}