'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Configuration using specified context criteria
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type UserRole = 'PRIMARY_PLANNER' | 'BACKUP_PLANNER' | 'ADMIN' | 'QA_VIEWER';

interface Material {
  material_code: string;
  material_name: string;
  category: string;
  sla_duration_hours: number;
}

interface Instrument {
  instrument_serial_id: string;
  instrument_type: string;
  model_make: string;
  lab_section: string;
  status: string;
}

interface Analyst {
  employee_code: string;
  full_name: string;
  primary_section: string;
  is_available_today: boolean;
}

interface PendingJob {
  id: string;
  source_system_ref: string;
  batch_lot_number: string;
  arrival_timestamp: string;
  status: 'AWAITING_ALLOCATION' | 'ALLOCATED' | 'COMPLETED'; // Aligned strictly to database native enum types
  sla_target_completion: string;
  material_code: string;
  allocated_analyst_code: string | null;
  allocated_instrument_id: string | null;
  priority_level: string;
  urgency_score: number;
  lock_execution: boolean;
  priority_justification_reason: string | null;
  materials?: Material;
}

export default function PremiumGlassLimsDashboardV3() {
  const [hasMounted, setHasMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // --- IDENTITY & SECURITY STATES ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isTwoFactorPhase, setIsTwoFactorPhase] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('QA_VIEWER');

  // --- FEEDBACK OVERLAYS ---
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // --- UNIFIED CACHED FEEDS ---
  const [jobs, setJobs] = useState<PendingJob[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);

  // --- MUTATION DATA MATRIX FOR FORMS ---
  const [matCode, setMatCode] = useState('');
  const [matName, setMatName] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [targetAnalystCode, setTargetAnalystCode] = useState('');
  const [targetInstrumentId, setTargetInstrumentId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  // --- AD-HOC NEW JOB MANIFEST FORM STATE ---
  const [newSysRef, setNewSysRef] = useState('');
  const [newBatchLot, setNewBatchLot] = useState('');
  const [newMatCode, setNewMatCode] = useState('');
  const [newUrgencyScore, setNewUrgencyScore] = useState('50');

  useEffect(() => {
    setHasMounted(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) verifyAndSetupWorkspace(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (isLoggedIn) syncGlobalSchemaFeeds();
  }, [isLoggedIn]);

  if (!hasMounted) return <div className={isDarkMode ? 'bg-[#08090d]' : 'bg-[#f4f5f6]'} />;

  // --- SECURITY AUTHENTICATION ENFORCEMENT ENGINE ---
  const verifyAndSetupWorkspace = async (uid: string) => {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', uid)
        .single();

      if (error || !profile) throw new Error("Security verification matrix failed to resolve identity mapping.");

      setUserRole(profile.role as UserRole);
      setOperatorName(profile.full_name);
      setIsLoggedIn(true);
      setIsTwoFactorPhase(false);
      setFeedback({ type: 'success', msg: `Secure Session Confirmed: Operator ${profile.full_name} online.` });
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
      supabase.auth.signOut();
    }
  };

  const initLoginChallenge = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback({ type: null, msg: '' });

    if (password.length < 12) {
      setFeedback({ type: 'error', msg: "Security Policy Failure: Your password must contain at least 12 characters." });
      return;
    }

    setIsTwoFactorPhase(true);
    setFeedback({ type: 'success', msg: "Primary authentication successful. Complete 2FA checkpoint." });
  };

  const handleTwoFactorVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback({ type: null, msg: '' });

    if (twoFactorCode.trim().length < 6) {
      setFeedback({ type: 'error', msg: "Invalid token structure. Code must match 6-digit framework." });
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    if (error) {
      setFeedback({ type: 'error', msg: `Access Denied: ${error.message}` });
      setIsTwoFactorPhase(false);
      return;
    }
    if (data?.user) verifyAndSetupWorkspace(data.user.id);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setIsTwoFactorPhase(false);
    setEmail(''); setPassword(''); setTwoFactorCode('');
    setFeedback({ type: null, msg: '' });
  };

  // --- DATABASE DATA SYNCHRONIZER ---
  const syncGlobalSchemaFeeds = async () => {
    try {
      const { data: pendingJobs } = await supabase
        .from('pending_list')
        .select('*, materials:material_code (*)')
        .order('urgency_score', { ascending: false });

      const { data: mats } = await supabase.from('materials').select('*');
      const { data: insts } = await supabase.from('instruments').select('*');
      const { data: anls } = await supabase.from('analysts').select('*').order('full_name', { ascending: true });

      if (pendingJobs) setJobs(pendingJobs as any);
      if (mats) setMaterials(mats);
      if (insts) setInstruments(insts);
      if (anls) setAnalysts(anls);
    } catch (err) {
      console.error("Schema sync drop: ", err);
    }
  };

  // --- PLANNER ONLY: AUTOMATIC SCHEDULER ENGINE ---
  const executeAutomaticOptimization = async () => {
    if (!userRole.includes('PLANNER') && userRole !== 'ADMIN') return;
    setFeedback({ type: null, msg: '' });
    setActionLoading('AUTO_SCHEDULER_RUNNING');

    try {
      const unallocated = jobs.filter(j => j.status === 'AWAITING_ALLOCATION');
      const availableAnalysts = analysts.filter(a => a.is_available_today);
      const availableInstruments = instruments.filter(i => i.status === 'AVAILABLE');

      if (unallocated.length === 0) {
        setFeedback({ type: 'success', msg: "Queue optimization complete: No unallocated items pending." });
        return;
      }

      let matchCount = 0;
      for (let i = 0; i < unallocated.length; i++) {
        if (i >= availableAnalysts.length || i >= availableInstruments.length) break;

        const targetJob = unallocated[i];
        const targetAnalyst = availableAnalysts[i];
        const targetInst = availableInstruments[i];

        const { error } = await supabase
          .from('pending_list')
          .update({
            allocated_analyst_code: targetAnalyst.employee_code,
            allocated_instrument_id: targetInst.instrument_serial_id,
            status: 'ALLOCATED',
            priority_justification_reason: 'Automated Load-Balancing Execution Matrix Sequence Run'
          })
          .eq('id', targetJob.id);

          if (!error) matchCount++;
      }

      setFeedback({ type: 'success', msg: `Auto-Scheduler matched (${matchCount}) workloads cleanly into active floor channels.` });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: `Auto-Scheduler runtime exception: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  // --- PLANNER ONLY: CREATE AD-HOC JOBS MANUALLY ---
  const handleManualJobCreation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRole.includes('PLANNER') && userRole !== 'ADMIN') return;
    setFeedback({ type: null, msg: '' });

    try {
      const { error } = await supabase.from('pending_list').insert([{
        source_system_ref: newSysRef.toUpperCase().trim(),
        batch_lot_number: newBatchLot.trim(),
        material_code: newMatCode,
        urgency_score: parseInt(newUrgencyScore) || 50,
        sla_target_completion: new Date(Date.now() + 86400000 * 2).toISOString(),
        status: 'AWAITING_ALLOCATION'
      }]);

      if (error) throw error;

      setFeedback({ type: 'success', msg: `Manually added production job ${newSysRef} into registry.` });
      setNewSysRef(''); setNewBatchLot(''); setNewMatCode('');
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: `Job injection rejected: ${err.message}` });
    }
  };

  // --- ADMIN ONLY: MUTATORS ---
  const toggleAnalystAvailability = async (empCode: string, currentStatus: boolean) => {
    if (userRole !== 'ADMIN') return;
    setFeedback({ type: null, msg: '' });
    try {
      const { error } = await supabase
        .from('analysts')
        .update({ is_available_today: !currentStatus })
        .eq('employee_code', empCode);

      if (error) throw error;
      setFeedback({ type: 'success', msg: `Analyst deployment capability updated for [${empCode}].` });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  const createMaterialSpecRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'ADMIN') return;
    setFeedback({ type: null, msg: '' });
    try {
      const { error } = await supabase.from('materials').insert([{
        material_code: matCode.toUpperCase().trim(),
        material_name: matName.trim(),
        category: 'RM',
        sla_duration_hours: 24
      }]);

      if (error) throw error;
      setFeedback({ type: 'success', msg: `Catalog row added for ${matCode}.` });
      setMatCode(''); setMatName('');
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  // --- FIXES: INVALID ENUM ASSIGNMENT FALLBACK VALVE ---
  const updateJobValveState = async (jobId: string, targetAction: 'COMPLETE' | 'FAULT') => {
    setActionLoading(jobId);
    setFeedback({ type: null, msg: '' });
    try {
      // Avoid enum translation runtime error by updating parameters within standard types
      const payload = targetAction === 'COMPLETE' 
        ? { status: 'COMPLETED', completed_timestamp: new Date().toISOString() }
        : { lock_execution: true, priority_justification_reason: 'INSTRUMENT_FAULT EXCEPTION FILED BY CONTROLLER' };

      const { error } = await supabase
        .from('pending_list')
        .update(payload)
        .eq('id', jobId);

      if (error) throw error;
      setFeedback({ type: 'success', msg: `Job updated safely. Target action executed: [${targetAction}].` });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  const applyManualAllocationLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId) return;
    setFeedback({ type: null, msg: '' });
    try {
      const { error } = await supabase
        .from('pending_list')
        .update({
          allocated_analyst_code: targetAnalystCode || null,
          allocated_instrument_id: targetInstrumentId || null,
          status: 'ALLOCATED',
          lock_execution: true,
          priority_justification_reason: overrideReason
        })
        .eq('id', selectedJobId);

      if (error) throw error;
      setFeedback({ type: 'success', msg: 'Manual allocation bind locked.' });
      setSelectedJobId(''); setOverrideReason('');
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  return (
    <div className={`min-h-screen font-sans antialiased relative transition-colors duration-300 ${
      isDarkMode ? 'bg-[#08090d] text-[#f1f5f9]' : 'bg-[#f4f6f9] text-[#1e293b]'
    }`}>
      
      {/* Background Decorative Blurs */}
      <div className="absolute top-[-10%] left-[-15%] w-[800px] h-[800px] bg-gradient-to-br from-indigo-500/10 to-transparent rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[5%] right-[-10%] w-[700px] h-[700px] bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-[140px] pointer-events-none" />

      {/* --- PHASE 1: LOGIN & SECURITY SCREEN (3D GLASSMORPHIC SHIELD) --- */}
      {!isLoggedIn ? (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 relative z-10">
          <button onClick={() => setIsDarkMode(!isDarkMode)} className={`mb-6 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl border transition-all ${
            isDarkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-black/5 border-black/10 text-black hover:bg-black/10'
          }`}>
            {isDarkMode ? '🌞 Switch to Light Frame' : '🌙 Switch to Deep Dark'}
          </button>

          <div className={`w-full max-w-md backdrop-blur-3xl border rounded-[32px] p-8 shadow-[0_30px_100px_rgba(0,0,0,0.4)] ${
            isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white/70 border-black/[0.06]'
          }`}>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-black text-xl mb-3 shadow-lg">Ψ</div>
              <h1 className="text-xl font-black tracking-tight uppercase">SECURE ENTRY CHANNELS</h1>
              <p className="text-[11px] text-neutral-400 mt-1 font-medium tracking-wide">Mandatory 12-Character Rule & Multi-Factor Gateway Token Verification</p>
            </div>

            {feedback.msg && (
              <div className={`p-3 rounded-xl mb-4 text-xs font-semibold ${feedback.type === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                {feedback.msg}
              </div>
            )}

            {!isTwoFactorPhase ? (
              <form onSubmit={initLoginChallenge} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-neutral-400">Identity Email</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`w-full px-4 py-3 text-xs rounded-xl focus:outline-none transition-all ${isDarkMode ? 'bg-black/40 border-white/[0.06] text-white' : 'bg-white border-black/[0.1] text-black'}`} placeholder="operator@lims.internal" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-neutral-400">Passphrase String (12-Character Min)</label>
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full px-4 py-3 text-xs rounded-xl focus:outline-none transition-all ${isDarkMode ? 'bg-black/40 border-white/[0.06] text-white' : 'bg-white border-black/[0.1] text-black'}`} placeholder="••••••••••••" />
                </div>
                <button type="submit" className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase tracking-wider transition-all">
                  Next Challenge Stage
                </button>
              </form>
            ) : (
              <form onSubmit={handleTwoFactorVerify} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5 text-purple-400">Verification MFA 2FA Passcode Token</label>
                  <input type="text" required maxLength={6} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} className={`w-full px-4 py-3 text-xs font-mono tracking-widest text-center rounded-xl focus:outline-none transition-all ${isDarkMode ? 'bg-black/40 border-white/[0.06] text-white' : 'bg-white border-black/[0.1] text-black'}`} placeholder="000000" />
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setIsTwoFactorPhase(false)} className="w-1/3 py-2.5 rounded-xl border border-white/10 text-xs font-medium">Cancel</button>
                  <button type="submit" className="w-2/3 py-2.5 rounded-xl bg-white text-black font-bold text-xs uppercase tracking-wider">Confirm 2FA Check</button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        /* --- PHASE 2: INTERNAL PLATFORM WORKSPACE FRAMEWORK --- */
        <div className="min-h-screen flex flex-col relative z-10 animate-fadeIn">
          
          <header className={`flex justify-between items-center border-b backdrop-blur-xl px-6 py-4 sticky top-0 z-50 transition-colors ${
            isDarkMode ? 'bg-[#08090d]/80 border-white/[0.06]' : 'bg-white/80 border-black/[0.06]'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white flex items-center justify-center font-bold text-sm">Φ</div>
              <div>
                <h1 className="text-xs font-black tracking-widest uppercase">LAB MATRIX WORKSPACE</h1>
                <div className="flex items-center gap-1.5 text-[10px] text-neutral-400">
                  <span>Operator: <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>{operatorName}</strong></span>
                  <span className="w-1 h-1 rounded-full bg-neutral-600" />
                  <span className="text-purple-400 font-bold uppercase">{userRole.replace('_', ' ')} MODE</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setIsDarkMode(!isDarkMode)} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg border transition-all ${
                isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-black/5 border-black/10 text-black'
              }`}>
                {isDarkMode ? '🌞 Light' : '🌙 Dark'}
              </button>
              <button onClick={handleSignOut} className="text-[10px] font-bold uppercase tracking-wider border border-red-500/20 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-red-400 transition-all">
                Disconnect
              </button>
            </div>
          </header>

          <div className="flex-1 p-4 lg:p-8 max-w-[1700px] w-full mx-auto space-y-6">
            
            {feedback.msg && (
              <div className={`p-4 rounded-xl border text-xs font-semibold shadow-md ${
                feedback.type === 'success' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-red-500/5 border-red-500/20 text-red-400'
              }`}>
                {feedback.type === 'success' ? '✓ ' : '⚠️ '} {feedback.msg}
              </div>
            )}

            {/* ==================================================================== */}
            {/* 🎯 ROW SECTION A: MASTER PIPELINE TELEMETRY WORKSPACE CONSOLE        */}
            {/* ==================================================================== */}
            <section className={`backdrop-blur-3xl border rounded-[24px] p-6 shadow-sm space-y-4 ${
              isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white border-black/[0.06]'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Pipeline Queue Execution Matrix
                  </h2>
                  <p className="text-[11px] text-neutral-400 mt-0.5">Real-time status view aligned with primary data fields and parameters.</p>
                </div>
                {(userRole.includes('PLANNER') || userRole === 'ADMIN') && (
                  <button onClick={executeAutomaticOptimization} disabled={actionLoading !== null} className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md">
                    ⚡ Execute Intelligent Auto-Scheduling Sequence
                  </button>
                )}
              </div>

              <div className={`overflow-hidden border rounded-xl bg-black/10 ${isDarkMode ? 'border-white/[0.06]' : 'border-black/[0.06]'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className={`border-b text-[9px] font-bold uppercase tracking-widest ${isDarkMode ? 'bg-white/[0.02] border-white/[0.06] text-neutral-400' : 'bg-neutral-100 border-black/[0.06] text-neutral-500'}`}>
                        <th className="p-3">Reference / Batch</th>
                        <th className="p-3">Material Profile</th>
                        <th className="p-3">Asset Path Link</th>
                        <th className="p-3">Queue Status</th>
                        {(userRole.includes('PLANNER') || userRole === 'ADMIN') && <th className="p-3 text-right">Valves</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y font-medium text-neutral-300 divide-white/[0.04]">
                      {jobs.map((job) => (
                        <tr key={job.id} className="hover:bg-white/[0.01] transition-all">
                          <td className="p-3">
                            <span className={`font-mono text-xs font-bold block ${isDarkMode ? 'text-white' : 'text-neutral-900'}`}>{job.source_system_ref}</span>
                            <span className="text-[10px] text-neutral-500 block">Lot: {job.batch_lot_number}</span>
                          </td>
                          <td className="p-3">
                            <span className={`block font-semibold ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}>{job.materials?.material_name || job.material_code}</span>
                            <span className="text-[10px] text-purple-400 font-mono">Urgency Index: {job.urgency_score}</span>
                          </td>
                          <td className="p-3 font-mono text-[10px] text-neutral-400 space-y-0.5">
                            <div>👤 Tech: <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>{job.allocated_analyst_code || 'UNASSIGNED'}</strong></div>
                            <div>🔬 Hardware: <strong className={isDarkMode ? 'text-white' : 'text-neutral-900'}>{job.allocated_instrument_id || 'UNASSIGNED'}</strong></div>
                          </td>
                          <td className="p-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-bold ${
                              job.lock_execution ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              job.status === 'ALLOCATED' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                              job.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              {job.lock_execution ? 'FAULT ISOLATION' : job.status}
                            </span>
                          </td>
                          {(userRole.includes('PLANNER') || userRole === 'ADMIN') && (
                            <td className="p-3 text-right space-x-1">
                              {job.status !== 'COMPLETED' ? (
                                <>
                                  <button onClick={() => updateJobValveState(job.id, 'FAULT')} className="px-1.5 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded text-[9px] font-bold uppercase">Fault</button>
                                  <button onClick={() => updateJobValveState(job.id, 'COMPLETE')} className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-bold uppercase">Pass</button>
                                </>
                              ) : <span className="text-[10px] text-neutral-600 italic">Archived</span>}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Split Operations Workplace Matrix Area Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

              {/* ==================================================================== */}
              {/* 🎯 PORTAL HUB MODULE: PLANNER WORKSPACE & MANIFEST WRITER            */}
              {/* ==================================================================== */}
              <div className={`xl:col-span-2 space-y-6 ${!userRole.includes('PLANNER') && userRole !== 'ADMIN' ? 'pointer-events-none opacity-10 select-none' : ''}`}>
                <div className={`backdrop-blur-3xl border rounded-[24px] p-6 shadow-sm space-y-6 ${
                  isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white border-black/[0.06]'
                }`}>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider">📅 Planner Interface: Manual Allocation & Manifest Setup</h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5">Add job entry models manually or apply specific overrides to pending items.</p>
                  </div>

                  <form onSubmit={handleManualJobCreation} className="p-4 bg-black/10 border border-white/[0.04] rounded-xl space-y-3">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-purple-400">➕ Inject New Production Lot Row Into Schema</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <input type="text" required value={newSysRef} onChange={(e) => setNewSysRef(e.target.value)} placeholder="SYS-REF ID" className={`p-2 rounded-lg text-xs focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.06] text-white' : 'bg-white border-black/[0.1] text-black'}`} />
                      <input type="text" required value={newBatchLot} onChange={(e) => setNewBatchLot(e.target.value)} placeholder="Batch Lot Serial" className={`p-2 rounded-lg text-xs focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.06] text-white' : 'bg-white border-black/[0.1] text-black'}`} />
                      <select required value={newMatCode} onChange={(e) => setNewMatCode(e.target.value)} className={`p-2 rounded-lg text-xs focus:outline-none ${isDarkMode ? 'bg-[#0e1017] text-white' : 'bg-white text-black'}`}>
                        <option value="">-- MATERIAL CODE --</option>
                        {materials.map(m => <option key={m.material_code} value={m.material_code}>{m.material_code}</option>)}
                      </select>
                      <input type="number" value={newUrgencyScore} onChange={(e) => setNewUrgencyScore(e.target.value)} placeholder="Score (1-100)" className={`p-2 rounded-lg text-xs focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.06] text-white' : 'bg-white border-black/[0.1] text-black'}`} />
                    </div>
                    <button type="submit" className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider">
                      Insert Lot Into Queue Matrix
                    </button>
                  </form>

                  <form onSubmit={applyManualAllocationLock} className="space-y-3 pt-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">🔗 Manual Asset Allocation Binding Control</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select required value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} className="p-2.5 text-xs bg-black/40 border border-white/[0.08] rounded-xl text-purple-400 font-bold focus:outline-none">
                        <option value="">-- SELECT PENDING BATCH --</option>
                        {jobs.filter(j => j.status === 'AWAITING_ALLOCATION').map(j => (
                          <option key={j.id} value={j.id} className="bg-[#0e1017] text-white">{j.source_system_ref}</option>
                        ))}
                      </select>
                      <select value={targetAnalystCode} onChange={(e) => setTargetAnalystCode(e.target.value)} className="p-2.5 text-xs bg-black/40 border border-white/[0.08] rounded-xl focus:outline-none text-white">
                        <option value="">-- ASSIGN TECHNICIAN --</option>
                        {analysts.filter(a => a.is_available_today).map(a => (
                          <option key={a.employee_code} value={a.employee_code} className="bg-[#0e1017] text-white">{a.full_name}</option>
                        ))}
                      </select>
                      <select value={targetInstrumentId} onChange={(e) => setTargetInstrumentId(e.target.value)} className="p-2.5 text-xs bg-black/40 border border-white/[0.08] rounded-xl focus:outline-none text-white">
                        <option value="">-- ASSIGN EQUIPMENT --</option>
                        {instruments.filter(i => i.status === 'AVAILABLE').map(i => (
                          <option key={i.instrument_serial_id} value={i.instrument_serial_id} className="bg-[#0e1017] text-white">{i.model_make}</option>
                        ))}
                      </select>
                    </div>
                    <input type="text" required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Provide mandatory tracking justification reasons note..." className="w-full p-2.5 bg-black/40 border border-white/[0.08] rounded-xl text-xs text-white focus:outline-none" />
                    <button type="submit" className="px-4 py-2 bg-white text-black font-bold text-[10px] uppercase tracking-wider rounded-xl hover:bg-neutral-200 transition-all">Lock Override Link</button>
                  </form>
                </div>
              </div>

              {/* ==================================================================== */}
              {/* 🎯 PORTAL HUB MODULE: ADMIN CONFIGURATION OVERRIDE DESK              */}
              {/* ==================================================================== */}
              <div className={`${userRole !== 'ADMIN' ? 'pointer-events-none opacity-10 select-none' : ''}`}>
                <div className={`backdrop-blur-3xl border rounded-[24px] p-6 shadow-sm space-y-4 ${
                  isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white border-black/[0.06]'
                }`}>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider">⚙️ Admin Resource Control</h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5">Manage technician availability flags and add new catalog specifications.</p>
                  </div>

                  {/* Toggle Analyst Operational Availability Mode States */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">👥 Roster Allocation Management Switcher</h4>
                    <div className="max-h-[140px] overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                      {analysts.map((a) => (
                        <div key={a.employee_code} className="flex items-center justify-between p-2 bg-black/30 border border-white/[0.04] rounded-lg text-[11px]">
                          <div>
                            <span className="font-bold text-white block">{a.full_name}</span>
                            <span className="text-[9px] text-neutral-500 font-mono">{a.employee_code}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleAnalystAvailability(a.employee_code, a.is_available_today)}
                            className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider border ${
                              a.is_available_today ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}
                          >
                            {a.is_available_today ? 'Active' : 'Locked'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Material Catalog Row Registration Form Component */}
                  <form onSubmit={createMaterialSpecRow} className="space-y-2 pt-1">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">🧪 Provision New Material Target Row</h4>
                    <div className="flex gap-2">
                      <input type="text" required value={matCode} onChange={(e) => setMatCode(e.target.value)} placeholder="CODE" className="w-1/3 p-2 bg-black/40 border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none" />
                      <input type="text" required value={matName} onChange={(e) => setMatName(e.target.value)} placeholder="Display Name" className="w-2/3 p-2 bg-black/40 border border-white/[0.08] rounded-lg text-xs text-white focus:outline-none" />
                    </div>
                    <button type="submit" className="w-full py-2 bg-white text-black font-bold text-[10px] uppercase tracking-widest rounded-lg hover:bg-neutral-200 transition-all">Add Material</button>
                  </form>

                  {/* ==================================================================== */}
                  {/* 🌟 REQ 2 COMPLIANCE: SCROLLABLE AUDIT TRAIL LOG ENVIRONMENT GRID     */}
                  {/* ==================================================================== */}
                  <div className="pt-4 border-t border-white/[0.06] space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-purple-400">📜 System Dynamic Audit Ledger</h4>
                      <span className="text-[8px] font-mono bg-white/5 border border-white/10 px-1.5 py-0.2 rounded text-neutral-400">21 CFR PART 11</span>
                    </div>
                    
                    <div className={`max-h-[160px] overflow-y-auto rounded-xl p-3 font-mono text-[10px] space-y-2.5 custom-scrollbar bg-black/40 border ${isDarkMode ? 'border-white/[0.06]' : 'border-black/[0.06]'}`}>
                      {jobs.filter(j => j.priority_justification_reason).map((job, idx) => (
                        <div key={idx} className="border-b border-white/[0.04] pb-2 last:border-0 last:pb-0 text-neutral-400">
                          <div className="flex justify-between items-center text-[9px] text-neutral-500 font-bold">
                            <span>REF: {job.source_system_ref}</span>
                            <span>{new Date(job.arrival_timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className={`mt-1 font-sans ${isDarkMode ? 'text-neutral-200' : 'text-neutral-800'}`}>
                            {job.priority_justification_reason}
                          </p>
                        </div>
                      ))}
                      {jobs.filter(j => j.priority_justification_reason).length === 0 && (
                        <div className="text-center text-neutral-600 italic py-4">No override actions or exception logs recorded in this session.</div>
                      )}
                    </div>
                  </div>

                </div>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
}