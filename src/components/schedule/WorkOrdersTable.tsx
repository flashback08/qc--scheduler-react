'use client';

import React from 'react';
import { PendingJob, UserRole } from '@/lib/supabase';

interface WorkOrdersTableProps {
  jobs: PendingJob[];
  userRole: UserRole;
  isDarkMode: boolean;
  actionLoading: string | null;
  onUpdateState: (id: string, action: 'COMPLETE' | 'FAULT') => void;
}

export default function WorkOrdersTable({ jobs, userRole, isDarkMode, actionLoading, onUpdateState }: WorkOrdersTableProps) {
  return (
    <div className={`overflow-hidden border rounded-2xl ${isDarkMode ? 'border-white/[0.08] bg-black/5' : 'border-slate-400 bg-slate-50'}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className={`border-b text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'bg-white/[0.02] border-white/[0.08] text-neutral-400' : 'bg-slate-200 border-slate-400 text-slate-800'}`}>
              <th className="p-4">Sample Reference / Lot Number</th>
              <th className="p-4">Material Details</th>
              <th className="p-4">Assigned Team Member & Hardware</th>
              <th className="p-4">Current Progress Status</th>
              {(userRole.includes('PLANNER') || userRole === 'ADMIN') && <th className="p-4 text-right">Testing Control Actions</th>}
            </tr>
          </thead>
          <tbody className={`divide-y font-medium ${isDarkMode ? 'divide-white/[0.04] text-neutral-200' : 'divide-slate-300 text-slate-900'}`}>
            {jobs.map((job) => {
              const isJobAssigned = job.allocated_analyst_code || job.allocated_instrument_id;
              let displayStatus = 'WAITING FOR ASSIGNMENT';
              let badgeStyle = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
              
              if (job.status === 'COMPLETED') {
                displayStatus = 'COMPLETED';
                badgeStyle = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
              } else if (job.lock_execution) {
                displayStatus = '⚠️ ISSUE INVESTIGATION';
                badgeStyle = 'bg-red-500/10 text-red-600 border-red-500/20';
              } else if (isJobAssigned) {
                displayStatus = 'ALLOCATED / ASSIGNED';
                badgeStyle = 'bg-blue-500/10 text-blue-600 border-blue-500/20';
              }

              return (
                <tr key={job.id} className={`transition-all ${isDarkMode ? 'hover:bg-white/[0.01]' : 'hover:bg-slate-200/50'}`}>
                  <td className="p-4">
                    <span className={`font-mono text-base font-bold block ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{job.source_system_ref}</span>
                    <span className="text-xs text-slate-500 block mt-0.5 font-semibold">Batch Serial: {job.batch_lot_number}</span>
                  </td>
                  <td className="p-4">
                    <span className="block font-bold text-base">{job.materials?.material_name || job.material_code}</span>
                    <span className="text-xs text-purple-700 dark:text-purple-400 font-mono font-bold">Urgency Priority Level: {job.urgency_score}/100</span>
                  </td>
                  <td className="p-4 font-mono text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <div>👤 Technician: <strong className={isDarkMode ? 'text-white' : 'text-slate-900 font-bold'}>{job.allocated_analyst_code || 'NOT CHOSEN YET'}</strong></div>
                    <div>🔬 Machine Node: <strong className={isDarkMode ? 'text-white' : 'text-slate-900 font-bold'}>{job.allocated_instrument_id || 'NOT CHOSEN YET'}</strong></div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold border ${badgeStyle}`}>{displayStatus}</span>
                  </td>
                  {(userRole.includes('PLANNER') || userRole === 'ADMIN') && (
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      {job.status !== 'COMPLETED' ? (
                        <>
                          <button onClick={() => onUpdateState(job.id, 'FAULT')} disabled={actionLoading !== null} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 rounded-lg text-xs font-bold uppercase">Report Issue</button>
                          <button onClick={() => onUpdateState(job.id, 'COMPLETE')} disabled={actionLoading !== null} className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 rounded-lg text-xs font-bold uppercase">Mark Completed</button>
                        </>
                      ) : <span className="text-xs text-slate-400 italic font-normal">Task Closed</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}