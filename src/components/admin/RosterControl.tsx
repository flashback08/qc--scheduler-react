'use client';
import React from 'react';
import { Analyst } from '@/lib/supabase';

interface RosterControlProps {
  analysts: Analyst[];
  isDarkMode: boolean;
  onToggle: (code: string, status: boolean) => void;
}

export default function RosterControl({ analysts, isDarkMode, onToggle }: RosterControlProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">👥 Team Member Availability Flags</h4>
      <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
        {analysts.map((a) => (
          <div key={a.employee_code} className={`flex items-center justify-between p-3 border rounded-xl text-xs font-mono ${isDarkMode ? 'bg-black/30 border-white/[0.04]' : 'bg-slate-100 border-slate-300'}`}>
            <div>
              <span className={`font-bold font-sans block text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{a.full_name}</span>
              <span className="text-slate-500 font-semibold">ID Reference Code: {a.employee_code}</span>
            </div>
            <button type="button" onClick={() => onToggle(a.employee_code, a.is_available_today)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${a.is_available_today ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
              {a.is_available_today ? '🟢 On Shift' : '🔴 Off Shift'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}