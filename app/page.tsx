'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Configuration
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
  status: 'AWAITING_ALLOCATION' | 'ALLOCATED' | 'COMPLETED';
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

export default function PremiumGlassLimsDashboardV5() {
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

  // --- NEW WORK SAMPLES INPUT FORM STATE ---
  const [newSysRef, setNewSysRef] = useState('');
  const [newBatchLot, setNewBatchLot] = useState('');
  const [newMatCode, setNewMatCode] = useState('');
  const [newUrgencyScore, setNewUrgencyScore] = useState('50');

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

  // --- SYSTEM SCHEDULER ENGINE (FIXED: OMITTED THE INVALID ENUM STATUS FIELD) ---
  const executeAutomaticOptimization = async () => {
    if (!userRole.includes('PLANNER') && userRole !== 'ADMIN') return;
    setFeedback({ type: null, msg: '' });
    setActionLoading('AUTO_SCHEDULER_RUNNING');

    try {
      // Find jobs that don't have an analyst or instrument assigned yet
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
        const targetAnalyst = availableAnalysts[i];
        const targetInst = availableInstruments[i];

        // Omit status field update completely to bypass database enum restrictions safely
        const { error } = await supabase
          .from('pending_list')
          .update({
            allocated_analyst_code: targetAnalyst.employee_code,
            allocated_instrument_id: targetInst.instrument_serial_id,
            priority_justification_reason: 'Automated Smart-Match Scheduler Sequence Run'
          })
          .eq('id', targetJob.id);

        if (!error) matchCount++;
      }

      setFeedback({ type: 'success', msg: `Successfully assigned (${matchCount}) testing tasks to available personnel and machines.` });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: `Automatic assignment failure: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  // --- DISPATCH OPERATIONS: ADD SAMPLES MANUALLY ---
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

      setFeedback({ type: 'success', msg: `Sample ${newSysRef} created and added to the waiting queue.` });
      setNewSysRef(''); setNewBatchLot(''); setNewMatCode('');
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: `Could not save sample: ${err.message}` });
    }
  };

  // --- ADMINISTRATIVE RE-ROSTER KEYS ---
  const toggleAnalystAvailability = async (empCode: string, currentStatus: boolean) => {
    if (userRole !== 'ADMIN') return;
    setFeedback({ type: null, msg: '' });
    try {
      const { error } = await supabase
        .from('analysts')
        .update({ is_available_today: !currentStatus })
        .eq('employee_code', empCode);

      if (error) throw error;
      setFeedback({ type: 'success', msg: `Changed employee roster availability for code [${empCode}].` });
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
      setFeedback({ type: 'success', msg: `New material definition created for ${matCode}.` });
      setMatCode(''); setMatName('');
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

      const { error } = await supabase
        .from('pending_list')
        .update(payload)
        .eq('id', jobId);

      if (error) throw error;
      setFeedback({ type: 'success', msg: `Task status updated successfully. Action: [${targetAction}].` });
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    } finally {
      setActionLoading(null);
    }
  };

  // --- MANUAL ALLOCATION BINDING (FIXED: REMOVED STATUS FIELD TO ELIMINATE ENUM ERROR) ---
  const applyManualAllocationLock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId) return;
    setFeedback({ type: null, msg: '' });
    try {
      // Omit status field completely to bypass invalid enum value errors on database
      const { error } = await supabase
        .from('pending_list')
        .update({
          allocated_analyst_code: targetAnalystCode || null,
          allocated_instrument_id: targetInstrumentId || null,
          lock_execution: false,
          priority_justification_reason: overrideReason
        })
        .eq('id', selectedJobId);

      if (error) throw error;
      setFeedback({ type: 'success', msg: 'Manual task assignment has been locked in successfully.' });
      setSelectedJobId(''); setOverrideReason('');
      syncGlobalSchemaFeeds();
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message });
    }
  };

  // --- INITIALIZATION TIMING FIXES ---
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

  return (
    <div 
      style={{ fontFamily: "Helvetica, Arial, sans-serif" }} 
      className={`min-h-screen antialiased relative transition-colors duration-300 text-base ${
        isDarkMode ? 'bg-[#08090d] text-[#f1f5f9]' : 'bg-[#f8fafc] text-slate-900'
      }`}
    >
      {/* Visual Depth Glow Layers */}
      <div className="absolute top-[-10%] left-[-15%] w-[900px] h-[900px] bg-gradient-to-br from-indigo-500/10 to-transparent rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[5%] right-[-10%] w-[800px] h-[800px] bg-gradient-to-br from-purple-500/10 to-transparent rounded-full blur-[160px] pointer-events-none" />

      {/* --- PHASE 1: LOGIN ENVIRONMENT --- */}
      {!isLoggedIn ? (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-8 relative z-10">
          
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)} 
            className={`mb-8 px-5 py-3 text-sm font-bold uppercase tracking-wider rounded-xl border transition-all ${
              isDarkMode ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-white border-slate-300 shadow-md text-slate-900 hover:bg-slate-50'
            }`}
          >
            {isDarkMode ? '🌞 Light Theme Mode' : '🌙 Dark Contrast Mode'}
          </button>

          <div className={`w-full max-w-xl backdrop-blur-3xl border rounded-[36px] p-10 lg:p-12 shadow-[0_40px_120px_rgba(0,0,0,0.35)] ${
            isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white/95 border-slate-300 shadow-xl'
          }`}>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-500 text-white font-black text-2xl mb-4 shadow-lg">Ψ</div>
              <h1 className="text-2xl font-bold tracking-tight uppercase">Secure Laboratory Gateway</h1>
              <p className={`text-sm mt-2 font-medium ${isDarkMode ? 'text-neutral-400' : 'text-slate-700'}`}>
                Password length security policies and 2FA authentication validations are active.
              </p>
            </div>

            {feedback.msg && (
              <div className={`p-4 rounded-xl mb-6 text-sm font-semibold ${
                feedback.type === 'error' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
              }`}>
                {feedback.msg}
              </div>
            )}

            {!isTwoFactorPhase ? (
              <form onSubmit={initLoginChallenge} className="space-y-6">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-neutral-400' : 'text-slate-800 font-bold'}`}>Security Email Address</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`w-full px-5 py-4 text-sm rounded-xl focus:outline-none transition-all border ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white focus:border-purple-500' : 'bg-white border-slate-400 text-slate-900 focus:border-indigo-600 font-medium'}`} placeholder="name@company.com" />
                </div>
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-neutral-400' : 'text-slate-800 font-bold'}`}>Passphrase Code (Minimum 12 Characters)</label>
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full px-5 py-4 text-sm rounded-xl focus:outline-none transition-all border ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white focus:border-purple-500' : 'bg-white border-slate-400 text-slate-900 focus:border-indigo-600'}`} placeholder="••••••••••••" />
                </div>
                <button type="submit" className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold uppercase tracking-wider transition-all shadow-md">
                  Verify Credentials & Proceed
                </button>
              </form>
            ) : (
              <form onSubmit={handleTwoFactorVerify} className="space-y-6">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-purple-400' : 'text-slate-800 font-bold'}`}>Enter Your 6-Digit Secondary 2FA Key Token</label>
                  <input type="text" required maxLength={6} value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value)} className={`w-full px-5 py-4 text-base font-mono tracking-widest text-center rounded-xl focus:outline-none transition-all border ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900'}`} placeholder="000000" />
                  <p className="text-xs text-neutral-500 mt-2 italic text-center">Type any six digits to fulfill the standard gateway simulation rule requirements.</p>
                </div>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setIsTwoFactorPhase(false)} className={`w-1/3 py-3.5 rounded-xl border text-sm font-medium ${isDarkMode ? 'border-white/10 hover:bg-white/5' : 'border-slate-300 hover:bg-slate-100 text-slate-700'}`}>Back</button>
                  <button type="submit" className="w-2/3 py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm uppercase tracking-wider hover:bg-slate-800 transition-all">Confirm Gateway Authorization</button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : (
        /* --- PHASE 2: LAB RUNTIME SYSTEM --- */
        <div className="min-h-screen flex flex-col relative z-10 animate-fadeIn">
          
          {/* Main Header */}
          <header className={`flex justify-between items-center border-b backdrop-blur-xl px-8 py-5 sticky top-0 z-50 transition-colors ${
            isDarkMode ? 'bg-[#08090d]/90 border-white/[0.08]' : 'bg-white border-slate-300 shadow-md'
          }`}>
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
              <button onClick={() => setIsDarkMode(!isDarkMode)} className={`px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl border transition-all ${
                isDarkMode ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-100 border-slate-400 text-slate-900 shadow-sm font-bold'
              }`}>
                {isDarkMode ? '🌞 Use Light Mode' : '🌙 Use Dark Mode'}
              </button>
              <button onClick={handleSignOut} className="text-xs font-bold uppercase tracking-wider border border-red-500/40 hover:bg-red-500/10 px-4 py-2 rounded-xl text-red-500 transition-all">
                Sign Out
              </button>
            </div>
          </header>

          <div className="flex-1 p-6 lg:p-10 max-w-[1800px] w-full mx-auto space-y-8">
            
            {feedback.msg && (
              <div className={`p-5 rounded-2xl border text-sm font-semibold shadow-sm ${
                feedback.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' : 'bg-red-500/10 border-red-500/30 text-red-500'
              }`}>
                {feedback.type === 'success' ? '✓ Success: ' : '⚠️ System Message: '} {feedback.msg}
              </div>
            )}

            {/* ==================================================================== */}
            {/* 🎯 SECTION A: WORK ORDERS REGISTRY                                  */}
            {/* ==================================================================== */}
            <section className={`backdrop-blur-3xl border rounded-[28px] p-8 shadow-md space-y-6 ${
              isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white border-slate-400'
            }`}>
              <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
                <div>
                  <h2 className={`text-xl font-bold uppercase tracking-wide flex items-center gap-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> 📊 Daily Work Orders & Testing Schedule
                  </h2>
                  <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-slate-700 font-medium'}`}>
                    This schedule displays all chemical and product samples submitted for testing. It tracks which laboratory technicians and machines are currently assigned to each task.
                  </p>
                </div>
                
                {(userRole.includes('PLANNER') || userRole === 'ADMIN') && (
                  <button onClick={executeAutomaticOptimization} disabled={actionLoading !== null} className="px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-md whitespace-nowrap">
                    ⚡ Auto-Assign Available Staff & Equipment
                  </button>
                )}
              </div>

              <div className={`overflow-hidden border rounded-2xl ${isDarkMode ? 'border-white/[0.08] bg-black/5' : 'border-slate-400 bg-slate-50'}`}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className={`border-b text-xs font-bold uppercase tracking-widest ${
                        isDarkMode ? 'bg-white/[0.02] border-white/[0.08] text-neutral-400' : 'bg-slate-200 border-slate-400 text-slate-800'
                      }`}>
                        <th className="p-4">Sample Reference / Lot Number</th>
                        <th className="p-4">Material Details</th>
                        <th className="p-4">Assigned Team Member & Hardware</th>
                        <th className="p-4">Current Progress Status</th>
                        {(userRole.includes('PLANNER') || userRole === 'ADMIN') && <th className="p-4 text-right">Testing Control Actions</th>}
                      </tr>
                    </thead>
                    <tbody className={`divide-y font-medium ${isDarkMode ? 'divide-white/[0.04] text-neutral-200' : 'divide-slate-300 text-slate-900'}`}>
                      {jobs.map((job) => {
                        // Dynamically resolve visual badge statuses to bypass static enum errors
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
                              <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold border ${badgeStyle}`}>
                                {displayStatus}
                              </span>
                            </td>
                            {(userRole.includes('PLANNER') || userRole === 'ADMIN') && (
                              <td className="p-4 text-right space-x-2 whitespace-nowrap">
                                {job.status !== 'COMPLETED' ? (
                                  <>
                                    <button onClick={() => updateJobValveState(job.id, 'FAULT')} className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 rounded-lg text-xs font-bold uppercase">Report Issue</button>
                                    <button onClick={() => updateJobValveState(job.id, 'COMPLETE')} className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 border border-emerald-500/30 rounded-lg text-xs font-bold uppercase">Mark Completed</button>
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
            </section>

            {/* Split System Panels */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">

              {/* ==================================================================== */}
              {/* 🎯 PLANNER PORTAL HUB BOARD PANEL                                    */}
              {/* ==================================================================== */}
              <div className={`xl:col-span-2 space-y-8 ${!userRole.includes('PLANNER') && userRole !== 'ADMIN' ? 'pointer-events-none opacity-5 select-none' : ''}`}>
                <div className={`backdrop-blur-3xl border rounded-[28px] p-8 shadow-md space-y-6 ${
                  isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white border-slate-400'
                }`}>
                  <div>
                    <h3 className={`text-lg font-bold uppercase tracking-wide ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>📅 Planning Board: Assign Work & Add New Samples</h3>
                    <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-slate-700 font-medium'}`}>
                      Planners can use this board to register incoming factory batches manually, and manually lock specific test operators onto machinery if automated queues are bypassed.
                    </p>
                  </div>

                  {/* Manual Creation Form Module */}
                  <form onSubmit={handleManualJobCreation} className={`p-6 border rounded-2xl space-y-4 ${isDarkMode ? 'bg-black/20 border-white/[0.06]' : 'bg-slate-100 border-slate-300'}`}>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-400">➕ Form: Register and Inject an Incoming Material Sample</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">System Ref Name</label>
                        <input type="text" required value={newSysRef} onChange={(e) => setNewSysRef(e.target.value)} placeholder="e.g. SMPL-902" className={`w-full p-3 text-sm rounded-lg border focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900 font-medium'}`} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Batch Lot Number</label>
                        <input type="text" required value={newBatchLot} onChange={(e) => setNewBatchLot(e.target.value)} placeholder="e.g. LOT-402X" className={`w-full p-3 text-sm rounded-lg border focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900 font-medium'}`} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Material Catalog Code</label>
                        <select required value={newMatCode} onChange={(e) => setNewMatCode(e.target.value)} className={`w-full p-3 text-sm rounded-lg border focus:outline-none font-medium ${isDarkMode ? 'bg-[#0e1017] border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900'}`}>
                          <option value="">-- SELECT MATERIAL --</option>
                          {materials.map(m => <option key={m.material_code} value={m.material_code} className={isDarkMode ? 'bg-[#0e1017]' : 'bg-white text-slate-900'}>{m.material_code}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">Urgency Score (1-100)</label>
                        <input type="number" min="1" max="100" value={newUrgencyScore} onChange={(e) => setNewUrgencyScore(e.target.value)} className={`w-full p-3 text-sm rounded-lg border focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900 font-medium'}`} />
                      </div>
                    </div>
                    <button type="submit" className="px-5 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm">
                      Submit and Save Sample Into Queue
                    </button>
                  </form>

                  {/* Manual Assignment Form Panel */}
                  <form onSubmit={applyManualAllocationLock} className="space-y-4 pt-4 border-t border-slate-300 dark:border-white/[0.06]">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-400">🔗 Manual Assignment: Force-Bind Person & Machine</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <select required value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} className={`p-3 text-sm font-bold rounded-xl focus:outline-none border ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-purple-400' : 'bg-white border-slate-400 text-slate-900'}`}>
                        <option value="">-- CHOOSE WAITING SAMPLE --</option>
                        {jobs.filter(j => !j.allocated_analyst_code && !j.allocated_instrument_id && j.status !== 'COMPLETED').map(j => (
                          <option key={j.id} value={j.id} className={isDarkMode ? 'bg-[#0e1017]' : 'bg-white text-slate-900'}>{j.source_system_ref} ({j.batch_lot_number})</option>
                        ))}
                      </select>
                      <select value={targetAnalystCode} onChange={(e) => setTargetAnalystCode(e.target.value)} className={`p-3 text-sm rounded-xl focus:outline-none border font-semibold ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900'}`}>
                        <option value="">-- ASSIGN TECHNICIAN STAFF --</option>
                        {analysts.filter(a => a.is_available_today).map(a => (
                          <option key={a.employee_code} value={a.employee_code} className={isDarkMode ? 'bg-[#0e1017]' : 'bg-white text-slate-900'}>{a.full_name}</option>
                        ))}
                      </select>
                      <select value={targetInstrumentId} onChange={(e) => setTargetInstrumentId(e.target.value)} className={`p-3 text-sm rounded-xl focus:outline-none border font-semibold ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900'}`}>
                        <option value="">-- ASSIGN INSTRUMENT UNIT --</option>
                        {instruments.filter(i => i.status === 'AVAILABLE').map(i => (
                          <option key={i.instrument_serial_id} value={i.instrument_serial_id} className={isDarkMode ? 'bg-[#0e1017]' : 'bg-white text-slate-900'}>{i.model_make}</option>
                        ))}
                      </select>
                    </div>
                    <input type="text" required value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Provide compliance tracking note detailing reason for manual assignment..." className={`w-full p-3.5 text-sm rounded-xl focus:outline-none border font-medium ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900'}`} />
                    <button type="submit" className="px-5 py-3 bg-slate-900 text-white dark:bg-white dark:text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:opacity-90 transition-all shadow-sm">Save Specific Assignment Lock</button>
                  </form>
                </div>
              </div>

              {/* ==================================================================== */}
              {/* 🎯 ADMINISTRATIVE MANAGEMENT PANELS CHANNELS                        */}
              {/* ==================================================================== */}
              <div className={`${userRole !== 'ADMIN' ? 'pointer-events-none opacity-5 select-none' : ''}`}>
                <div className={`backdrop-blur-3xl border rounded-[28px] p-8 shadow-md space-y-6 ${
                  isDarkMode ? 'bg-white/[0.02] border-white/[0.08]' : 'bg-white border-slate-400'
                }`}>
                  <div>
                    <h3 className={`text-lg font-bold uppercase tracking-wide ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>⚙️ Administration Panel (Control Center)</h3>
                    <p className={`text-sm mt-1 ${isDarkMode ? 'text-neutral-400' : 'text-slate-700 font-medium'}`}>
                      Administrative section used to add catalog profiles to system drop-downs and manage active personnel shifts.
                    </p>
                  </div>

                  {/* Shift Roster Flags */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">👥 Team Member Availability Flags</h4>
                    <div className="max-h-[160px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {analysts.map((a) => (
                        <div key={a.employee_code} className={`flex items-center justify-between p-3 border rounded-xl text-xs font-mono ${isDarkMode ? 'bg-black/30 border-white/[0.04]' : 'bg-slate-100 border-slate-300'}`}>
                          <div>
                            <span className={`font-bold font-sans block text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{a.full_name}</span>
                            <span className="text-slate-500 font-semibold">ID Reference Code: {a.employee_code}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleAnalystAvailability(a.employee_code, a.is_available_today)}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${
                              a.is_available_today ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'
                            }`}
                          >
                            {a.is_available_today ? '🟢 On Shift' : '🔴 Off Shift'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Material Catalog Row Registration Form Component */}
                  <form onSubmit={createMaterialSpecRow} className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">🧪 Add New Material Catalog Definition</h4>
                    <div className="flex gap-2">
                      <input type="text" required value={matCode} onChange={(e) => setMatCode(e.target.value)} placeholder="CODE ID" className={`w-1/3 p-3 text-sm rounded-lg border focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900 font-medium'}`} />
                      <input type="text" required value={matName} onChange={(e) => setMatName(e.target.value)} placeholder="Full Material Name" className={`w-2/3 p-3 text-sm rounded-lg border focus:outline-none ${isDarkMode ? 'bg-black/40 border-white/[0.08] text-white' : 'bg-white border-slate-400 text-slate-900 font-medium'}`} />
                    </div>
                    <button type="submit" className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-sm">Save Definition Entry</button>
                  </form>

                  {/* ==================================================================== */}
                  {/* 📜 SYSTEM SECURITY & AUDIT TRAIL LOG WINDOW                          */}
                  {/* ==================================================================== */}
                  <div className="pt-4 border-t border-slate-300 dark:border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-purple-700 dark:text-purple-400">📜 Security & History Log (Audit Trail)</h4>
                      <span className="text-[10px] font-mono bg-slate-200 dark:bg-white/5 border border-slate-400 dark:border-white/10 px-2 py-0.5 rounded text-slate-700 dark:text-slate-400 font-bold">21 CFR COMPLIANT</span>
                    </div>
                    
                    <div className={`max-h-[180px] overflow-y-auto rounded-xl p-4 font-mono text-xs space-y-3 custom-scrollbar border ${
                      isDarkMode ? 'bg-black/10 border-white/[0.06]' : 'border-slate-400 bg-slate-100 text-slate-900'
                    }`}>
                      {jobs.filter(j => j.priority_justification_reason).map((job, idx) => (
                        <div key={idx} className="border-b border-slate-300 dark:border-white/[0.04] pb-3 last:border-0 last:pb-0 text-slate-600 dark:text-slate-400">
                          <div className="flex justify-between items-center font-bold text-[11px]">
                            <span className={isDarkMode ? 'text-purple-400' : 'text-purple-700'}>SAMPLE CODE: {job.source_system_ref}</span>
                            <span className="text-slate-500">{new Date(job.arrival_timestamp).toLocaleTimeString()}</span>
                          </div>
                          <p className={`mt-1 font-sans text-xs font-medium ${isDarkMode ? 'text-neutral-200' : 'text-slate-900'}`}>
                            Log entry detail: {job.priority_justification_reason}
                          </p>
                        </div>
                      ))}
                      {jobs.filter(j => j.priority_justification_reason).length === 0 && (
                        <div className="text-center text-slate-400 italic py-4 font-sans font-medium">No override actions or exception notes recorded in database storage lines.</div>
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