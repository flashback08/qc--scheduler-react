'use client';
import React, { useState } from 'react';

interface MaterialFormProps {
  isDarkMode: boolean;
  onSave: (code: string, name: string) => void;
}

export default function MaterialForm({ isDarkMode, onSave }: MaterialFormProps) {
  const [matCode, setMatCode] = useState('');
  const [matName, setMatName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(matCode, matName);
    setMatCode(''); setMatName('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">🧪 Add New Material Catalog Definition</h4>
      <div className="flex gap-2">
        <input type="text" required value={matCode} onChange={(e) => setMatCode(e.target.value)} placeholder="CODE ID" className={`w-1/3 p-3 text-sm rounded-lg border focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900 font-medium'}`} />
        <input type="text" required value={matName} onChange={(e) => setMatName(e.target.value)} placeholder="Full Material Name" className={`w-2/3 p-3 text-sm rounded-lg border focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900 font-medium'}`} />
      </div>
      <button type="submit" className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-sm">Save Definition Entry</button>
    </form>
  );
}