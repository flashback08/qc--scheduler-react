'use client';
import React from 'react';
import { Instrument } from '@/lib/supabase';

interface InstrumentGridProps {
  instruments: Instrument[];
  onToggle: (id: string, status: string) => void;
}

export default function InstrumentGrid({ instruments, onToggle }: InstrumentGridProps) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider">🔬 Laboratory Instruments</h4>
      <div className="grid grid-cols-2 gap-2">
        {instruments.map(inst => (
          <div key={inst.instrument_serial_id} className="p-3 border rounded-lg flex justify-between items-center text-xs">
            <span>{inst.model_make}</span>
            <button 
              onClick={() => onToggle(inst.instrument_serial_id, inst.status === 'AVAILABLE' ? 'UNAVAILABLE' : 'AVAILABLE')}
              className={`px-2 py-1 rounded ${inst.status === 'AVAILABLE' ? 'bg-blue-500' : 'bg-gray-500'} text-white`}
            >
              {inst.status}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}