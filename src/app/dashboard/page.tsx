'use client';

import React, { useState, useEffect } from 'react';
import { supabase, UserRole, PendingJob, Material, Instrument, Analyst } from '@/lib/supabase';

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

export default function DashboardRuntime({
  isDarkMode = false,
  setIsDarkMode = () => {},
  operatorName = 'Operator',
  userRole = 'VIEWER' as UserRole,
  handleSignOut = () => {},
  initialFeedback = { type: null, msg: '' }
}: Partial<DashboardRuntimeProps>) {
  const [feedback, setFeedback] = useState(initialFeedback);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [jobs, setJobs] = useState<PendingJob[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);

  // --- DATABASE SYNCHRONIZATION ---
  const syncGlobalSchemaFeeds = async () => {
    try {
      const { data: pendingJobs } = await supabase.from('pending_list').select('*, materials:material_code (*)').order('urgency_score', { ascending: false });
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

  useEffect(() => { syncGlobalSchemaFeeds(); }, []);

  const executeAutomaticOptimization = async () => {
    if (!userRole?.includes('PLANNER') && userRole !== 'ADMIN') return;
    setFeedback({ type: null, msg: '' });
    setActionLoading('AUTO_SCHEDULER_RUNNING');
    try {
      const unallocated = jobs.filter(j => !j.allocated_analyst_code && !j.allocated_instrument_id && j.status !== 'COMPLETED');
      const availableAnalysts = analysts.filter(a => a.is_available_today);
      const availableInstruments = instruments.filter(i => i.status === 'AVAILABLE');
      if (unallocated.length === 0) return setFeedback({ type: 'success', msg: "Schedule Check: No unassigned samples found." });

      let matchCount = 0;
      for (let i = 0; i < unallocated.length; i++) {
        if (i >= availableAnalysts.length || i >= availableInstruments.length) break;
        const targetJob = unallocated[i];
        const { error } = await supabase.from('pending_list')
          .update({ allocated_analyst_code: availableAnalysts[i].employee_code, allocated_instrument_id: availableInstruments[i].instrument_serial_id, priority_justification_reason: 'Automated Smart-Match Scheduler Sequence Run' })
          .eq('id', targetJob.id);
        if (!error) matchCount++;
      }
      setFeedback({ type: 'success', msg: `Successfully assigned (${matchCount}) testing tasks cleanly.` });
      syncGlobalSchemaFeeds();
    } catch (err: any) { setFeedback({ type: 'error', msg: `Automatic assignment failure: ${err.message}` }); } 
    finally { setActionLoading(null); }
  };

  const handleManualJobCreation = async (data: { sysRef: string; batchLot: string; matCode: string; urgency: number }) => {
    setFeedback({ type: null, msg: '' });
    try {
      const { error } = await supabase.from('pending_list').insert([{ source_system_ref: data.sysRef.toUpperCase().trim(), batch_lot_number: data.batchLot.trim(), material_code: data.matCode, urgency_score: data.urgency, sla_target_completion: new Date(Date.now() + 172800000).toISOString(), status: 'AWAITING_ALLOCATION' }]);
      if (error) throw error;
      setFeedback({ type: 'success', msg: `Sample ${data.sysRef} created successfully.` });
      syncGlobalSchemaFeeds();
    } catch (err: any) { setFeedback({ type: 'error', msg: err.message }); }
  };

  const applyManualAllocationLock = async (data: { jobId: string; analystCode: string; instrumentId: string; reason: string }) => {
    setFeedback({ type: null, msg: '' });
    try {
      const { error } = await supabase.from('pending_list').update({ allocated_analyst_code: data.analystCode || null, allocated_instrument_id: data.instrumentId || null, lock_execution: false, priority_justification_reason: data.reason }).eq('id', data.jobId);
      if (error) throw error;
      setFeedback({ type: 'success', msg: 'Manual task assignment locked successfully.' });
      syncGlobalSchemaFeeds();
    } catch (err: any) { setFeedback({ type: 'error', msg: err.message }); }
  };

  const updateJobValveState = async (jobId: string, targetAction: 'COMPLETE' | 'FAULT') => {
    setActionLoading(jobId);
    setFeedback({ type: null, msg: '' });
    try {
      const payload = targetAction === 'COMPLETE' ? { status: 'COMPLETED', completed_timestamp: new Date().toISOString() } : { lock_execution: true, priority_justification_reason: '🚨 OPERATIONAL EQUIPMENT EXCEPTION FILED BY CONTROLLER' };
      const { error } = await supabase.from('pending_list').update(payload).eq('id', jobId);
      if (error) throw error;
      setFeedback({ type: 'success', msg: `Task status updated to [${targetAction}].` });
      syncGlobalSchemaFeeds();
    } catch (err: any) { setFeedback({ type: 'error', msg: err.message }); } 
    finally { setActionLoading(null); }
  };

  const handleAnalystAdd = async (name: string, section: string) => {
    if (userRole !== 'ADMIN') return;
    try {
      const newCode = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;
      const { error } = await supabase.from('analysts').insert([{ employee_code: newCode, full_name: name, primary_section: section, is_available_today: true }]);
      if (error) throw error;
      await supabase.from('audit_logs').insert([{ table_name: 'analysts', action: 'CREATE', record_id: newCode, justification: `Added new analyst: ${name}`, changed_by: operatorName }]);
      setFeedback({ type: 'success', msg: `Analyst ${name} added successfully.` });
      syncGlobalSchemaFeeds();
    } catch (err: any) { setFeedback({ type: 'error', msg: err.message }); }
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
    } catch (err: any) { setFeedback({ type: 'error', msg: err.message }); }
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
    } catch (err: any) { setFeedback({ type: 'error', msg: err.message }); }
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
    } catch (err: any) { setFeedback({ type: 'error', msg: err.message }); }
  };

  return (
    <div className={`min-h-screen antialiased transition-colors duration-300 ${isDarkMode ? 'bg-[#0B0F19] text-slate-200' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* FLOATING HEADER */}
      <div className="pt-6 px-6 lg:px-10 max-w-[1900px] mx-auto sticky top-0 z-50">
        <header className={`flex justify-between items-center px-6 py-4 rounded-2xl shadow-sm backdrop-blur-xl border ${isDarkMode ? 'bg-[#111827]/80 border-slate-800 shadow-black/20' : 'bg-white/80 border-slate-200 shadow-slate-200/50'}`}>
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30 text-white flex items-center justify-center font-bold text-xl ring-2 ring-white/10">Φ</div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">LIMS Command Center</h1>
              <div className="flex items-center gap-2 text-xs font-medium mt-0.5">
                <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>Operator: <span className={isDarkMode ? 'text-white' : 'text-slate-900'}>{operatorName}</span></span>
                <span className="w-1 h-1 rounded-full bg-slate-300" />
                <span className="text-indigo-500 font-bold tracking-wider">{(userRole || 'VIEWER').replace('_', ' ')}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={() => setIsDarkMode(!isDarkMode)} className={`p-2.5 rounded-xl transition-all ${isDarkMode ? 'bg-slate-800 hover:bg-slate-700 text-yellow-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
              {isDarkMode ? '☀️' : '🌙'}
            </button>
            <button onClick={handleSignOut} className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all ${isDarkMode ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-600'}`}>
              Sign Out
            </button>
          </div>
        </header>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="p-6 lg:p-10 max-w-[1900px] w-full mx-auto space-y-8">
        
        {/* FEEDBACK TOAST */}
        {feedback?.msg && (
          <div className={`p-4 rounded-xl border text-sm font-medium shadow-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${feedback.type === 'success' ? (isDarkMode ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700') : (isDarkMode ? 'bg-rose-950/30 border-rose-500/30 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700')}`}>
            <span className="text-lg">{feedback.type === 'success' ? '✅' : '⚠️'}</span>
            {feedback.msg}
          </div>
        )}

        {/* SECTION: LIVE SCHEDULE */}
        <section className={`rounded-3xl p-8 border shadow-sm transition-colors ${isDarkMode ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight flex items-center gap-3">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                </span>
                Active Testing Schedule
              </h2>
              <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Real-time overview of laboratory work orders and resource allocation.</p>
            </div>
            {(userRole?.includes('PLANNER') || userRole === 'ADMIN') && (
              <button onClick={executeAutomaticOptimization} disabled={actionLoading !== null} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                Auto-Assign Workload
              </button>
            )}
          </div>
          <WorkOrdersTable jobs={jobs} userRole={userRole || 'VIEWER'} isDarkMode={isDarkMode} actionLoading={actionLoading} onUpdateState={updateJobValveState} />
        </section>

        {/* SECTION: GRID PANELS */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          
          {/* PLANNER COLUMN */}
          <div className={`xl:col-span-7 space-y-8 ${!userRole?.includes('PLANNER') && userRole !== 'ADMIN' ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
            <div className={`rounded-3xl p-8 border shadow-sm h-full ${isDarkMode ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="mb-8">
                <h3 className="text-lg font-bold tracking-tight">Planning & Allocation</h3>
                <p className={`text-sm mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Inject samples and manage manual overrides.</p>
              </div>
              <div className="space-y-12">
                <SampleForm materials={materials} isDarkMode={isDarkMode} onSubmit={handleManualJobCreation} />
                <div className={`h-px w-full ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`} />
                <ForceBindForm jobs={jobs} analysts={analysts} instruments={instruments} isDarkMode={isDarkMode} onBind={applyManualAllocationLock} />
              </div>
            </div>
          </div>

          {/* ADMIN COLUMN */}
          <div className={`xl:col-span-5 space-y-8 ${userRole !== 'ADMIN' ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
            <div className={`rounded-3xl p-8 border shadow-sm ${isDarkMode ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'}`}>
              <div className="mb-8 flex items-center gap-3">
                <div className="p-2 bg-rose-500/10 text-rose-500 rounded-lg"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg></div>
                <div>
                  <h3 className="text-lg font-bold tracking-tight">System Admin</h3>
                  <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>Manage personnel and hardware.</p>
                </div>
              </div>
              
              <RosterControl analysts={analysts} isDarkMode={isDarkMode} onAdd={handleAnalystAdd} onDelete={handleAnalystDelete} onToggle={handleAnalystToggle} />
              
              <div className={`my-8 h-px w-full ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`} />
              
              <InstrumentGrid instruments={instruments} onToggle={handleInstrumentToggle} isDarkMode={isDarkMode} />
            </div>

            {/* AUDIT TRAIL CARD */}
            <div className={`rounded-3xl p-8 border shadow-sm ${isDarkMode ? 'bg-[#111827] border-slate-800' : 'bg-white border-slate-200'}`}>
               <AuditTrail jobs={jobs} isDarkMode={isDarkMode} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
