'use client';

import React, { useState, useEffect } from 'react';
import { supabase, UserRole, PendingJob, Material, Instrument, Analyst } from '@/lib/supabase';

// Standard Default Imports (Ensure your component files use `export default function...`)
import WorkOrdersTable from '@/components/schedule/WorkOrdersTable';
import SampleForm from '@/components/planner/SampleForm';
import ForceBindForm from '@/components/planner/ForceBindForm';
import RosterControl from '@/components/admin/RosterControl';
import InstrumentGrid from '@/components/admin/InstrumentGrid';
import AuditTrail from '@/components/admin/AuditTrail';

interface DashboardRuntimeProps {
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  operatorName: string;
  userRole: UserRole;
  handleSignOut: () => void;
  initialFeedback: { type: 'success' | 'error' | null; msg: string };
}

export default function DashboardRuntime({ isDarkMode, setIsDarkMode, operatorName, userRole, handleSignOut, initialFeedback }: DashboardRuntimeProps) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [jobs, setJobs] = useState<PendingJob[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);

  // --- DATABASE SYNCHRONIZATION ---
  const syncGlobalSchemaFeeds = async () => {
    try {
      const { data: pendingJobs } = await supabase
        .from('pending_list')
        .select('*, materials:material_code (*)')
        .order('urgency_score', { ascending: false });

      const { data: mats } = await supabase.from('materials').select('*');
      const { data: insts } = await supabase.from('instruments').select('*').order('instrument_serial_id', { ascending: true });
      const { data: anls } = await supabase.from('analysts').select('*').order('full_name', { ascending: true });

      if (pendingJobs) setJobs(pendingJobs as any);
      if (mats) setMaterials(mats);
      if (insts) setInstruments(insts);
      if (anls) setAnalysts(anls);
    } catch (err) {
      console.error("Schema sync loop dropped: ", err);
    }
  };

  useEffect(() => {
    syncGlobalSchemaFeeds();
  }, []);

  // --- SCHEDULING & PLANNER ACTIONS ---
  const executeAutomaticOptimization = async () => {
    if (!userRole.includes('PLANNER') && userRole !== 'ADMIN') return;
    setFeedback({ type: null, msg: '' });
    setActionLoading('AUTO_SCHEDULER_RUNNING');

    try {
      const unallocated = jobs.filter(j => !j.allocated_analyst_code && !j.allocated_instrument_id && j.status !== 'COMPLETED');
      const availableAnalysts = analysts.filter(a => a.is_available_today);
      const availableInstruments = instruments.filter(i => i.status === 'AVAILABLE');

      if (unallocated.length === 0) {
        setFeedback({ type: 'success', msg: "Schedule Check: No unassigned samples found." });
        return;
      }

      let matchCount = 0;
      for (let i = 0; i < unallocated.length; i++) {
        if (i >= availableAnalysts.length || i >= availableInstruments.length) break;

        const targetJob = unallocated[i];
        const { error } = await supabase
          .from('pending_list')
          .update({
            allocated_analyst_code: availableAnalysts[i].employee_code,
            allocated_instrument_id: availableInstruments[i].instrument_serial_id,
            priority_justification_reason: 'Automated Smart-Match Scheduler Sequence Run'
          })
          .eq('id', targetJob.id);

        if (!error) matchCount++;
      }

      setFeedback({ type: 'success', msg: `Successfully assigned (${matchCount}) testing tasks cleanly.` });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: `Automatic assignment failure: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleManualJobCreation = async (data: { sysRef: string; batchLot: string; matCode: string; urgency: number }) => {
    setFeedback({ type: null, msg: '' });
    try {
      const { error } = await supabase.from('pending_list').insert([{
        source_system_ref: data.sysRef.toUpperCase().trim(),
        batch_lot_number: data.batchLot.trim(),
        material_code: data.matCode,
        urgency_score: data.urgency,
        sla_target_completion: new Date(Date.now() + 172800000).toISOString(),
        status: 'AWAITING_ALLOCATION'
      }]);

      if (error) throw error;
      setFeedback({ type: 'success', msg: `Sample ${data.sysRef} created inside live queue successfully.` });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: `Could not save sample: ${err.message}` });
    }
  };

  const applyManualAllocationLock = async (data: { jobId: string; analystCode: string; instrumentId: string; reason: string }) => {
    setFeedback({ type: null, msg: '' });
    try {
      const { error } = await supabase
        .from('pending_list')
        .update({
          allocated_analyst_code: data.analystCode || null,
          allocated_instrument_id: data.instrumentId || null,
          lock_execution: false,
          priority_justification_reason: data.reason
        })
        .eq('id', data.jobId);

      if (error) throw error;
      setFeedback({ type: 'success', msg: 'Manual task assignment has been locked in successfully.' });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  const updateJobValveState = async (jobId: string, targetAction: 'COMPLETE' | 'FAULT') => {
    setActionLoading(jobId);
    setFeedback({ type: null, msg: '' });
    try {
      const payload = targetAction === 'COMPLETE' 
        ? { status: 'COMPLETED', completed_timestamp: new Date().toISOString() }
        : { lock_execution: true, priority_justification_reason: '🚨 OPERATIONAL EQUIPMENT EXCEPTION FILED BY CONTROLLER' };

      const { error } = await supabase.from('pending_list').update(payload).eq('id', jobId);
      if (error) throw error;
      setFeedback({ type: 'success', msg: `Task status updated successfully. Action: [${targetAction}].` });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  // --- ADMIN & COMPLIANCE ACTIONS ---
  const handleAnalystAdd = async (name: string, section: string) => {
    if (userRole !== 'ADMIN') return;
    try {
      const newCode = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
      const { error } = await supabase.from('analysts').insert([{ employee_code: newCode, full_name: name, primary_section: section, is_available_today: true }]);
      if (error) throw error;
      
      await supabase.from('audit_logs').insert([{ table_name: 'analysts', action: 'CREATE', record_id: newCode, justification: `Added new analyst: ${name}`, changed_by: operatorName }]);
      setFeedback({ type: 'success', msg: `Analyst ${name} added successfully.` });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  const handleAnalystDelete = async (code: string) => {
    if (userRole !== 'ADMIN') return;
    try {
      const reason = prompt("Enter justification for deleting this analyst record:");
      if (!reason) return;

      const { error } = await supabase.from('analysts').delete().eq('employee_code', code);
      if (error) throw error;

      await supabase.from('audit_logs').insert([{ table_name: 'analysts', action: 'DELETE', record_id: code, justification: reason, changed_by: operatorName }]);
      setFeedback({ type: 'success', msg: `Analyst record deleted.` });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  const handleAnalystToggle = async (code: string, currentStatus: boolean) => {
    if (userRole !== 'ADMIN') return;
    try {
      const reason = prompt(`Reason for changing shift status to ${!currentStatus ? 'ON' : 'OFF'}?`);
      if (!reason) return;

      const { error } = await supabase.from('analysts').update({ is_available_today: !currentStatus }).eq('employee_code', code);
      if (error) throw error;

      await supabase.from('audit_logs').insert([{ table_name: 'analysts', action: 'UPDATE', record_id: code, new_value: { is_available_today: !currentStatus }, justification: reason, changed_by: operatorName }]);
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  const handleInstrumentToggle = async (id: string, newStatus: string) => {
    if (userRole !== 'ADMIN') return;
    try {
      const reason = prompt(`Enter justification for setting machine to ${newStatus}:`);
      if (!reason) return;

      const { error } = await supabase.from('instruments').update({ status: newStatus }).eq('instrument_serial_id', id);
      if (error) throw error;

      await supabase.from('audit_logs').insert([{ table_name: 'instruments', action: 'UPDATE', record_id: id, new_value: { status: newStatus }, justification: reason, changed_by: operatorName }]);
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  // --- UI RENDER ---
  return (
    <div className={`min-h-screen antialiased relative text-base ${isDarkMode ? 'bg-[#08090d] text-[#f1f5f9]' : 'bg-[#f8fafc] text-slate-900'}`}>
      <header className={`flex justify-between items-center border-b backdrop-blur-xl px-8 py-5 sticky top-0 z-50 transition-colors ${isDarkMode ? 'bg-[#08090d]/90 border-white/[0.08]' : 'bg-white border-slate-300 shadow-md'}`}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center font-bold text-lg">Φ</div>
          <div>
            <h1 className={`text-base font-black tracking-widest uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Laboratory Command Dashboard</h1>
            <div className="flex items-center gap-2 text-xs mt-1 text-slate-500">
              <span>Current Operator: <strong className={isDarkMode ? 'text-white' : 'text-slate-900 font-bold'}>{operatorName}</strong></span>
              <span className="w-1 h-1 rounded-full bg-slate-400" />
              <span className="text-purple-600 dark:text-purple-400 font-bold uppercase">{userRole.replace('_', ' ')} System Level</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl border transition-all ${isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-100 border-slate-400 text-slate-900 shadow-sm font-bold'}`}>
            {isDarkMode ? '🌞 Use Light Mode' : '🌙 Use Dark Mode'}
          </button>
          <button onClick={handleSignOut} className="text-xs font-bold uppercase tracking-wider border border-red-500/40 hover:bg-red-500/10 px-4 py-2 rounded-xl text-red-500 transition-all">Sign Out</button>
        </div>
      </header>

      <div className="flex-1 p-6 lg:p-10 max-w-[1800px] w-full mx-auto space-y-8">
        {feedback.msg && (
          <div className={`p-5 rounded-2xl border text-sm font-semibold shadow-sm ${feedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' : 'bg-red-500/10 border-red-500/30 text-red-500'}`}>
            {feedback.type === 'success' ? '✓ Success: ' : '⚠️ System Message: '} {feedback.msg}
          </div>
        )}

        {/* --- SECTION: LIVE SCHEDULE --- */}
        <section className={`backdrop-blur-3xl border rounded-[28px] p-8 shadow-md space-y-6 ${isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white border-slate-400'}`}>
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            <div>
              <h2 className={`text-xl font-bold uppercase tracking-wide flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> 📊 Daily Work Orders & Testing Schedule
              </h2>
            </div>
            {(userRole.includes('PLANNER') || userRole === 'ADMIN') && (
              <button onClick={executeAutomaticOptimization} disabled={actionLoading !== null} className="px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs tracking-widest rounded-xl transition-all shadow-md uppercase">
                ⚡ Auto-Assign Available Staff & Equipment
              </button>
            )}
          </div>

          <WorkOrdersTable jobs={jobs} userRole={userRole} isDarkMode={isDarkMode} actionLoading={actionLoading} onUpdateState={updateJobValveState} />
        </section>

        {/* --- SECTION: PANELS --- */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          
          {/* Planner Forms */}
          <div className={`xl:col-span-2 space-y-8 ${!userRole.includes('PLANNER') && userRole !== 'ADMIN' ? 'pointer-events-none opacity-5 select-none' : ''}`}>
            <div className={`backdrop-blur-3xl border rounded-[28px] p-8 shadow-md space-y-6 ${isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white border-slate-400'}`}>
              <h3 className={`text-lg font-bold uppercase tracking-wide ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>📅 Planning Board: Assign Work & Add New Samples</h3>
              
              <SampleForm materials={materials} isDarkMode={isDarkMode} onSubmit={handleManualJobCreation} />
              <ForceBindForm jobs={jobs} analysts={analysts} instruments={instruments} isDarkMode={isDarkMode} onBind={applyManualAllocationLock} />
            </div>
          </div>

          {/* Admin Control Forms */}
          <div className={`${userRole !== 'ADMIN' ? 'pointer-events-none opacity-5 select-none' : ''}`}>
            <div className={`backdrop-blur-3xl border rounded-[28px] p-8 shadow-md space-y-6 ${isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white border-slate-400'}`}>
              <h3 className={`text-lg font-bold uppercase tracking-wide ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>⚙️ Administration Panel</h3>
              
              <RosterControl analysts={analysts} isDarkMode={isDarkMode} onAdd={handleAnalystAdd} onDelete={handleAnalystDelete} onToggle={handleAnalystToggle} />
              
              <div className="border-t border-slate-300 dark:border-white/[0.06] pt-4">
                <InstrumentGrid instruments={instruments} onToggle={handleInstrumentToggle} isDarkMode={isDarkMode} />
              </div>
              
              <AuditTrail jobs={jobs} isDarkMode={isDarkMode} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}