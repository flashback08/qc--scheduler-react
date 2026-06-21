'use client';
import React, { useState } from 'react';
import { Analyst } from '@/lib/supabase';

interface RosterControlProps {
  analysts: Analyst[];
  onAdd: (name: string, section: string) => void;
  onDelete: (code: string) => void;
  onToggle: (code: string, status: boolean) => void;
  isDarkMode: boolean;
}

export default function RosterControl({ analysts, onAdd, onDelete, onToggle, isDarkMode }: RosterControlProps) {
  const [newName, setNewName] = useState('');

  const handleDelete = (code: string) => {
    if (confirm("⚠️ WARNING: This will permanently delete the analyst record and all associated history from this view. Are you sure?")) {
      onDelete(code);
    }
  };

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">👥 Analyst Roster Management</h4>
      
      {/* Add New Analyst */}
      <div className="flex gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full Name" className="flex-1 p-2 text-sm rounded border bg-transparent" />
        <button onClick={() => { onAdd(newName, 'RM'); setNewName('') }} className="px-3 py-1 bg-purple-600 text-white rounded text-xs">ADD</button>
      </div>

      <div className="max-h-[200px] overflow-y-auto space-y-2">
        {analysts.map((a) => (
          <div key={a.employee_code} className="flex items-center justify-between p-3 border rounded-xl text-xs">
            <div>
              <span className="font-bold block">{a.full_name}</span>
              <span className="text-slate-500">{a.employee_code}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onToggle(a.employee_code, a.is_available_today)} className={`px-2 py-1 rounded ${a.is_available_today ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                {a.is_available_today ? 'ON' : 'OFF'}
              </button>
              <button onClick={() => handleDelete(a.employee_code)} className="px-2 py-1 bg-red-600 text-white rounded">DELETE</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}