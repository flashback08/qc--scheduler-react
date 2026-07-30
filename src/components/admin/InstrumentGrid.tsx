'use client';
import React from 'react';
import { Instrument } from '@/lib/supabase';

interface InstrumentGridProps {
  instruments: Instrument[];
  onToggle: (id: string, status: string) => void;
  isDarkMode?: boolean;
}

export default function InstrumentGrid({ instruments = [], onToggle, isDarkMode = false }: InstrumentGridProps) {
  return (
    <div className="space-y-5">
      <h4 className={`text-sm font-semibold ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
        Hardware Fleet
      </h4>
      
      <div className="grid grid-cols-2 gap-3">
        {(instruments || []).map((inst) => {
          const isAvail = inst.status === 'AVAILABLE';
          return (
            <div 
              key={inst.instrument_serial_id} 
              className={`p-4 border rounded-2xl transition-all flex flex-col gap-3 ${
                isDarkMode ? 'bg-[#0B0F19]/50 border-slate-800' : 'bg-slate-50/50 border-slate-100 shadow-sm'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-bold text-sm block">{inst.model_make}</span>
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {inst.instrument_serial_id}
                  </span>
                </div>
                {/* Glowing LED Dot */}
                <span className="relative flex h-2.5 w-2.5 mt-1">
                  {isAvail && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isAvail ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                </span>
              </div>

              <button 
                onClick={() => onToggle(inst.instrument_serial_id, isAvail ? 'UNAVAILABLE' : 'AVAILABLE')}
                className={`w-full py-2 rounded-xl text-xs font-semibold transition-all ${
                  isAvail 
                    ? (isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-600') 
                    : (isDarkMode ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20' : 'bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100')
                }`}
              >
                {isAvail ? 'Mark Offline' : 'Set Available'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
