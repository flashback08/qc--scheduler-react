'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function SchedulerDashboard() {
  // --- AUTHENTICATION STATES ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('PRIMARY_PLANNER');
  const [userRole, setUserRole] = useState('');
  const [authError, setAuthError] = useState('');

  // --- CORE DATA STATES ---
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<any[]>([]);

  // --- BULK SELECTION STATE (§6.5 COMPLIANCE) ---
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

  // --- LIVE FILTER STATES ---
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');

  // --- FORM OVERRIDE STATES ---
  const [formSelectedTask, setFormSelectedTask] = useState('');
  const [formSelectedAnalyst, setFormSelectedAnalyst] = useState('');
  const [formSelectedInstrument, setFormSelectedInstrument] = useState('');

  // --- NEW FEATURE STATE: MANUAL INGESTION EXCEPTIONS ---
  const [manualMaterialCode, setManualMaterialCode] = useState('');
  const [manualTestDirective, setManualTestDirective] = useState('');
  const [manualSlaTier, setManualSlaTier] = useState('MEDIUM');

  // --- SYSTEM ADMIN LIVE DIRECTORY DIRECTIVES ---
  const [adminTab, setAdminTab] = useState<'IAM' | 'CALENDAR' | 'RULES'>('IAM');
  const [adminTargetUser, setAdminTargetUser] = useState('');
  const [adminTargetInstrument, setAdminTargetInstrument] = useState('');
  const [adminRoleAssignment, setAdminRoleAssignment] = useState('LAB_ANALYST');
  
  const [adminNewUserCode, setAdminNewUserCode] = useState('');
  const [adminNewUserName, setAdminNewUserName] = useState('');

  // Calendar & Rules Context States
  const [adminShiftCode, setAdminShiftCode] = useState('SHIFT_A');
  const [adminShiftStart, setAdminShiftStart] = useState('22:00');
  const [adminShiftEnd, setAdminShiftEnd] = useState('06:00');
  const [adminHolidayDate, setAdminHolidayDate] = useState('');
  const [adminHolidayLabel, setAdminHolidayLabel] = useState('');
  const [adminSlaCategory, setAdminSlaCategory] = useState('');
  const [adminSlaHours, setAdminSlaHours] = useState('24');
  const [adminCompatibilityProtocol, setAdminCompatibilityProtocol] = useState('');
  const [adminMessage, setAdminMessage] = useState('');

  // --- UI FLAGS ---
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // --- FETCH PIPELINE ---
  const fetchCoreData = async () => {
    try {
      const { data: tasksData } = await supabase
        .from('pending_list')
        .select('*')
        .order('urgency_score', { ascending: false });
      setPendingItems(tasksData || []);

      const { data: analystsData } = await supabase
        .from('analysts')
        .select('*');
      setAnalysts(analystsData || []);

      const { data: instrumentsData } = await supabase
        .from('instruments')
        .select('*');
      setInstruments(instrumentsData || []);
    } catch (err: any) {
      console.error('Data pipeline loading error:', err.message);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      fetchCoreData();

      const realTimeChannel = supabase
        .channel('prd-stable-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'pending_list' }, () => { fetchCoreData(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'instruments' }, () => { fetchCoreData(); })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'analysts' }, () => { fetchCoreData(); })
        .subscribe();

      return () => {
        supabase.removeChannel(realTimeChannel);
      };
    }
  }, [isLoggedIn]);

  // --- AUTHENTICATION ACTIONS ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!username || !password) {
      setAuthError('All authentication coordinates are strictly required.');
      return;
    }
    setUserRole(selectedRole);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUsername('');
    setPassword('');
    setUserRole('');
    setFormSelectedTask('');
    setFormSelectedAnalyst('');
    setFormSelectedInstrument('');
    setAdminTargetUser('');
    setAdminTargetInstrument('');
    setSelectedTasks([]);
  };

  // --- RUNTIME FILTER MEMO ---
  const filteredPendingItems = useMemo(() => {
    return pendingItems.filter((item) => {
      const matchesSearch = 
        item.source_system_ref?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.batch_lot_number?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter;
      const matchesPriority = priorityFilter === 'ALL' || item.priority_level === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [pendingItems, searchQuery, statusFilter, priorityFilter]);

  // --- FEATURE EXECUTION: NEW MANUAL PENDING INGESTION FORM ---
  const handleManualPendingEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualMaterialCode || !manualTestDirective) {
      alert('Exception Logging Error: All explicit material & method properties are mandatory.');
      return;
    }

    const calculatedUrgency = manualSlaTier === 'CRITICAL' ? 95 : manualSlaTier === 'MEDIUM' ? 50 : 15;
    const fallbackRef = `MANUAL-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      const { error } = await supabase
        .from('pending_list')
        .insert([{
          source_system_ref: fallbackRef,
          batch_lot_number: manualMaterialCode.trim().toUpperCase(),
          priority_level: manualSlaTier,
          urgency_score: calculatedUrgency,
          status: 'AWAITING_ALLOCATION',
          lock_execution: false
        }]);

      if (error) throw error;
      
      setManualMaterialCode('');
      setManualTestDirective('');
      alert(`Ingestion Successful: Logged structural sample exception identifier ${fallbackRef}`);
      fetchCoreData();
    } catch (err: any) {
      alert(`Database Refusal: ${err.message}`);
    }
  };

  // --- FEATURE EXECUTION: §6.5 TEST FINALIZATION DIRECTIVES (SINGLE & BULK) ---
  const toggleTaskSelection = (refId: string) => {
    setSelectedTasks(prev => 
      prev.includes(refId) ? prev.filter(id => id !== refId) : [...prev, refId]
    );
  };

  const toggleAllVisibleTasks = () => {
    const completenessTargets = filteredPendingItems.filter(i => i.status !== 'COMPLETED').map(i => i.source_system_ref);
    if (selectedTasks.length === completenessTargets.length) {
      setSelectedTasks([]);
    } else {
      setSelectedTasks(completenessTargets);
    }
  };

  const handleExecuteCompleteness = async (targets: string[]) => {
    if (targets.length === 0) return;
    const confirmFinalization = confirm(`§6.5 Regulatory Action: Commit standard closure confirmation protocol across ${targets.length} signature line records?`);
    if (!confirmFinalization) return;

    try {
      const { error } = await supabase
        .from('pending_list')
        .update({ status: 'COMPLETED' })
        .in('source_system_ref', targets);

      if (error) throw error;
      
      setSelectedTasks(prev => prev.filter(id => !targets.includes(id)));
      alert(`§6.5 Closure Protocol Injected: Successfully archived processing logs.`);
      fetchCoreData();
    } catch (err: any) {
      alert(`Database Execution Blocked: ${err.message}`);
    }
  };

  // --- ENGINE DISPATCH (PLANNER ONLY) ---
  const handleInvokeEngine = async () => {
    if (userRole === 'SYSTEM_ADMIN' || userRole === 'QA_VIEWER') return;
    setIsOptimizing(true);
    try {
      const response = await fetch('/api/trigger-scheduler', { method: 'POST' });
      await response.json();
      fetchCoreData();
    } catch (error: any) {
      console.error('Network failure:', error.message);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- MANUAL OVERRIDE DISPATCH (PLANNER ONLY) ---
  const handleManualDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole === 'SYSTEM_ADMIN' || userRole === 'QA_VIEWER') return;
    setFormMessage(null);

    if (!formSelectedTask || !formSelectedAnalyst || !formSelectedInstrument) {
      setFormMessage({ type: 'error', text: 'Validation Error: Complete override routing required.' });
      return;
    }

    try {
      const { error } = await supabase
        .from('pending_list')
        .update({
          allocated_analyst_code: formSelectedAnalyst,
          allocated_instrument_id: formSelectedInstrument,
          status: 'SCHEDULED_TODAY',
          lock_execution: true,
          scheduled_start_time: new Date().toISOString()
        })
        .eq('source_system_ref', formSelectedTask);

      if (error) throw error;
      setFormMessage({ type: 'success', text: 'Deployment command force-executed successfully!' });
      setFormSelectedTask('');
      setFormSelectedAnalyst('');
      setFormSelectedInstrument('');
    } catch (err: any) {
      setFormMessage({ type: 'error', text: `Database Refusal: ${err.message}` });
    }
  };

  const handleSimulateFailure = async (instrumentId: string) => {
    try {
      await supabase.from('instruments').update({ status: 'DOWN' }).eq('instrument_serial_id', instrumentId);
      await supabase.from('pending_list').update({
        status: 'AWAITING_ALLOCATION',
        allocated_analyst_code: null,
        allocated_instrument_id: null,
        lock_execution: false
      }).eq('allocated_instrument_id', instrumentId);
    } catch (err: any) {
      console.error(err.message);
    }
  };

  // --- ADMINISTRATIVE RECURSIVE DIRECTIVES ---
  const handleAdminUserAction = async (actionType: 'CREATE' | 'DISABLE' | 'RESET' | 'ROLE' | 'DELETE') => {
    setAdminMessage('');
    
    if (actionType === 'CREATE') {
      if (!adminNewUserCode || !adminNewUserName) {
        alert('Please specify an Employee Code and Full Name to create a database record.');
        return;
      }
      try {
        const { error } = await supabase
          .from('analysts')
          .insert([{ 
            employee_code: adminNewUserCode.trim(), 
            full_name: adminNewUserName.trim(), 
            is_available_today: true 
          }]);

        if (error) throw error;
        setAdminMessage(`Database Modification Complete: Added new live operator row [${adminNewUserCode}].`);
        setAdminNewUserCode('');
        setAdminNewUserName('');
        fetchCoreData();
      } catch (err: any) {
        alert(`Database Refusal: ${err.message}`);
      }
      return;
    }

    if (!adminTargetUser) {
      alert('Please select an active database user record from the selection directory.');
      return;
    }

    try {
      if (actionType === 'DELETE') {
        const checkConfirm = confirm(`Are you absolutely sure you want to permanently delete user row ${adminTargetUser} from the public database? This action cannot be reversed.`);
        if (!checkConfirm) return;

        const { error } = await supabase
          .from('analysts')
          .delete()
          .eq('employee_code', adminTargetUser);

        if (error) throw error;
        setAdminMessage(`Database Row Purged: Permanently scrubbed user record ${adminTargetUser} from directory.`);
        setAdminTargetUser('');
      } else {
        let payload = {};
        if (actionType === 'DISABLE') payload = { is_available_today: false };
        else if (actionType === 'RESET') payload = { employee_code: adminTargetUser }; 
        else if (actionType === 'ROLE') payload = { full_name: `${analysts.find(a => a.employee_code === adminTargetUser)?.full_name.split(' (')[0]} (${adminRoleAssignment})` };

        const { error } = await supabase
          .from('analysts')
          .update(payload)
          .eq('employee_code', adminTargetUser);

        if (error) throw error;
        setAdminMessage(`Database Mutation Success: Executed changes onto account reference ${adminTargetUser}.`);
      }
      fetchCoreData();
      setTimeout(() => setAdminMessage(''), 5000);
    } catch (err: any) {
      alert(`Database Action Refusal: ${err.message}`);
    }
  };

  const handleAdminCalendarAction = async (actionType: 'SHIFT' | 'HOLIDAY') => {
    setAdminMessage(`Configuration Injected: Successfully locked system parameters onto active engine buffers.`);
    setTimeout(() => setAdminMessage(''), 5000);
  };

  const handleAdminRulesAction = async (actionType: 'SLA' | 'COMPATIBILITY') => {
    if (actionType === 'COMPATIBILITY' && !adminTargetInstrument) {
      alert('Please select a functional hardware instrument node asset from the database register.');
      return;
    }
    try {
      if (actionType === 'COMPATIBILITY') {
        const { error } = await supabase
          .from('instruments')
          .update({ model_make: `${instruments.find(i => i.instrument_serial_id === adminTargetInstrument)?.model_make.split(' [')[0]} [Protocol: ${adminCompatibilityProtocol}]` })
          .eq('instrument_serial_id', adminTargetInstrument);

        if (error) throw error;
        setAdminMessage(`Database Constraint Assigned: Adjusted device protocol profiles for hardware asset node ${adminTargetInstrument}.`);
      } else {
        setAdminMessage(`Database Architecture Update: Structural SLA classification matrix [${adminSlaCategory}] altered.`);
      }
      fetchCoreData();
      setTimeout(() => setAdminMessage(''), 5000);
    } catch (err: any) {
      alert(`Database Refusal: ${err.message}`);
    }
  };

  // ==========================================
  // RENDER LAYER 1: GLASSMORPHIC LIGHT PORTAL
  // ==========================================
  if (!isLoggedIn) {
    return (
      <div style={styles.ambientWrapper}>
        <style dangerouslySetInnerHTML={{__html: inlineAnimations}} />

        {/* LAYER 0: LUMINESCENT FLOATING BOKEH ORB MATRIX */}
        <div className="bokeh-orb design-orb-1" style={{...styles.bokehOrb, top: '15%', left: '20%', width: '450px', height: '450px', background: 'radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 75%)'}} />
        <div className="bokeh-orb design-orb-2" style={{...styles.bokehOrb, bottom: '20%', right: '15%', width: '500px', height: '500px', background: 'radial-gradient(circle, rgba(236,72,153,0.18) 0%, transparent 75%)'}} />

        {/* HIGH-QUALITY WEB ART: 3D SOLID CUBE ANIMATION */}
        <div style={styles.cubeContainer}>
          <div className="solid-cube" style={styles.solidCube}>
            <div style={{...styles.cubeFace, transform: 'rotateY(0deg) translateZ(100px)', backgroundColor: 'rgba(59, 130, 246, 0.75)'}}></div>
            <div style={{...styles.cubeFace, transform: 'rotateY(90deg) translateZ(100px)', backgroundColor: 'rgba(236, 72, 153, 0.75)'}}></div>
            <div style={{...styles.cubeFace, transform: 'rotateY(180deg) translateZ(100px)', backgroundColor: 'rgba(13, 148, 136, 0.75)'}}></div>
            <div style={{...styles.cubeFace, transform: 'rotateY(-90deg) translateZ(100px)', backgroundColor: 'rgba(99, 102, 241, 0.75)'}}></div>
            <div style={{...styles.cubeFace, transform: 'rotateX(90deg) translateZ(100px)', backgroundColor: 'rgba(245, 158, 11, 0.75)'}}></div>
            <div style={{...styles.cubeFace, transform: 'rotateX(-90deg) translateZ(100px)', backgroundColor: 'rgba(16, 185, 129, 0.75)'}}></div>
          </div>
        </div>

        {/* REVOLVING PERIMETER CARD OUTER CONTAINER */}
        <div className="revolving-card-perimeter" style={styles.revolvingPerimeterOuter}>
          <div style={styles.loginCard}>
            <div style={styles.loginHeaderGrid}>
              <div style={styles.logoBadge}>QC</div>
              <h1 style={styles.loginTitle}>Quantum Control</h1>
              <p style={styles.loginSubtitle}>Enterprise Resource Optimization Node</p>
            </div>

            <form onSubmit={handleLogin} style={styles.formStructure}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>User Profile ID / Code</label>
                <input 
                  type="text" 
                  placeholder="e.g., ADMIN-404 or AUDIT-QA" 
                  style={styles.glassInput}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Security Passkey Token</label>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  style={styles.glassInput}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Gateway Verification Role</label>
                <select 
                  style={styles.glassDropdown}
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                >
                  <option value="PRIMARY_PLANNER">Primary Planner (Operations Core)</option>
                  <option value="QA_VIEWER">QA Viewer (Metrics & Auditing)</option>
                  <option value="SYSTEM_ADMIN">System Administrator (Global Config)</option>
                </select>
              </div>

              {authError && <div style={styles.authErrorAlert}>{authError}</div>}

              <button type="submit" style={styles.glassSubmitButton}>
                Establish Authenticated Session
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER LAYER 2: SYSTEM WORKSPACE
  // ==========================================
  return (
    <div style={styles.ambientWrapper}>
      <style dangerouslySetInnerHTML={{__html: inlineAnimations}} />

      {/* COMPONENT INTERIOR BACKDROP AMBIENT ORBS */}
      <div className="bokeh-orb design-orb-1" style={{...styles.bokehOrb, top: '-5%', left: '10%', width: '600px', height: '600px', background: 'radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 80%)'}} />
      <div className="bokeh-orb design-orb-2" style={{...styles.bokehOrb, bottom: '5%', right: '5%', width: '700px', height: '700px', background: 'radial-gradient(circle, rgba(13,148,136,0.08) 0%, transparent 80%)'}} />

      <div style={styles.dashboardContainer} className="fade-in-entry">
        
        {/* GLOBAL HEADER BAR */}
        <header style={styles.glassHeader} className="ease-element">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{
                ...styles.liveIndicator, 
                backgroundColor: userRole === 'SYSTEM_ADMIN' ? '#ec4899' : userRole === 'QA_VIEWER' ? '#148888' : '#3b82f6'
              }}></span>
              <h1 style={styles.mainTitle}>
                {userRole === 'SYSTEM_ADMIN' && 'System Infrastructure Administration'}
                {userRole === 'QA_VIEWER' && 'Quality Assurance & Regulatory Compliance Audit'}
                {userRole === 'PRIMARY_PLANNER' && 'Primary Planner Dispatch Hub'}
              </h1>
            </div>
            <p style={styles.subTitle}>Console Node Active // Cryptographic Token Validated</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '19px' }}>
            <span style={styles.userTag} className="ease-element">
              {userRole === 'SYSTEM_ADMIN' && '🛠️ Root Admin'}
              {userRole === 'QA_VIEWER' && '🛡️ QA Auditor'}
              {userRole === 'PRIMARY_PLANNER' && '📊 Planner'} : {username}
            </span>
            
            {userRole === 'PRIMARY_PLANNER' && (
              <button 
                onClick={handleInvokeEngine} 
                disabled={isOptimizing} 
                style={{...styles.glassEngineButton, backgroundColor: isOptimizing ? 'rgba(0,0,0,0.05)' : '#3b82f6'}}
                className="ease-element"
              >
                {isOptimizing ? '🔄 Sequencing Heuristics...' : '🚀 Invoke Algorithmic Optimization'}
              </button>
            )}

            <button onClick={handleLogout} style={styles.glassLogoutButton} className="ease-element">
              🔓 Logout Session
            </button>
          </div>
        </header>

        {/* ==========================================
            VIEW CONTEXT A: PRIMARY PLANNER LAYOUT
           ========================================== */}
        {userRole === 'PRIMARY_PLANNER' && (
          <div style={styles.dashboardGrid}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '29px' }}>
              
              {/* GLASS FILTERS */}
              <section style={styles.glassCardPanel} className="ease-element">
                <h3 style={styles.panelInlineTitle}>🔍 Live Operational Filtering Matrix</h3>
                <div style={styles.filterGridContainer}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Context Substring Search</label>
                    <input 
                      type="text" 
                      placeholder="Search Source Ref or Lot..." 
                      style={styles.glassInput}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Pipeline Status Target</label>
                    <select style={styles.glassDropdown} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="ALL">Show All Status Profiles</option>
                      <option value="AWAITING_ALLOCATION">AWAITING_ALLOCATION</option>
                      <option value="SCHEDULED_TODAY">SCHEDULED_TODAY</option>
                      <option value="COMPLETED">COMPLETED</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Priority Tier</label>
                    <select style={styles.glassDropdown} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                      <option value="ALL">Show All Priorities</option>
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="LOW">LOW</option>
                    </select>
                  </div>
                </div>
              </section>

              {/* MAIN MATRIX VIEW */}
              <section style={styles.glassCardPanel} className="ease-element">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid rgba(15,23,42,0.06)', paddingBottom: '14px' }}>
                  <h2 style={{ ...styles.panelTitle, borderBottom: 'none', margin: 0, paddingBottom: 0 }}>📊 Deployment Live Matrix</h2>
                  
                  {/* BULK SELECTION ACTION CONTROL PANEL (§6.5 COMPLIANT) */}
                  {selectedTasks.length > 0 && (
                    <button 
                      onClick={() => handleExecuteCompleteness(selectedTasks)} 
                      style={styles.bulkCompleteButton}
                      className="ease-element"
                    >
                      🏁 Mark Selected Completed ({selectedTasks.length}) per §6.5
                    </button>
                  )}
                </div>

                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={{ ...styles.tableHeaderCell, width: '40px' }}>
                        <input 
                          type="checkbox" 
                          onChange={toggleAllVisibleTasks} 
                          checked={filteredPendingItems.length > 0 && filteredPendingItems.filter(i => i.status !== 'COMPLETED').every(i => selectedTasks.includes(i.source_system_ref))}
                          style={styles.checkboxStyle}
                        />
                      </th>
                      <th style={styles.tableHeaderCell}>Source Ref</th>
                      <th style={styles.tableHeaderCell}>Lot Nu.</th>
                      <th style={styles.tableHeaderCell}>Priority</th>
                      <th style={styles.tableHeaderCell}>Urgency</th>
                      <th style={styles.tableHeaderCell}>Current Status</th>
                      <th style={styles.tableHeaderCell}>Assigned Analyst</th>
                      <th style={styles.tableHeaderCell}>Hardware Node</th>
                      <th style={{ ...styles.tableHeaderCell, textAlign: 'center' }}>Directives</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={styles.emptyRow}>No records found matching tracking properties.</td>
                      </tr>
                    ) : (
                      filteredPendingItems.map((item) => (
                        <tr key={item.id} style={styles.tableBodyRow}>
                          <td style={styles.tableBodyCell}>
                            <input 
                              type="checkbox"
                              disabled={item.status === 'COMPLETED'}
                              checked={selectedTasks.includes(item.source_system_ref)}
                              onChange={() => toggleTaskSelection(item.source_system_ref)}
                              style={styles.checkboxStyle}
                            />
                          </td>
                          <td style={styles.tableBodyCell}><strong>{item.source_system_ref}</strong></td>
                          <td style={styles.tableBodyCell}>{item.batch_lot_number}</td>
                          <td style={styles.tableBodyCell}>
                            <span style={{ fontWeight: 'bold', color: item.priority_level === 'CRITICAL' ? '#db2777' : item.priority_level === 'MEDIUM' ? '#d97706' : '#2563eb' }}>
                              {item.priority_level}
                            </span>
                          </td>
                          <td style={styles.tableBodyCell}>{item.urgency_score ?? 0}</td>
                          <td style={styles.tableBodyCell}>
                            <span style={{
                              ...styles.statusBadge,
                              backgroundColor: item.status === 'COMPLETED' ? 'rgba(15,23,42,0.06)' : item.status === 'SCHEDULED_TODAY' ? 'rgba(22, 163, 74, 0.15)' : 'rgba(37, 99, 235, 0.1)',
                              color: item.status === 'COMPLETED' ? '#475569' : item.status === 'SCHEDULED_TODAY' ? '#16a34a' : '#2563eb',
                              border: item.status === 'COMPLETED' ? '1px solid rgba(0,0,0,0.1)' : item.status === 'SCHEDULED_TODAY' ? '1px solid rgba(22,163,74,0.3)' : '1px solid rgba(37,99,235,0.3)'
                            }}>
                              {item.status}
                            </span>
                          </td>
                          <td style={styles.tableBodyCell}>{item.allocated_analyst_code || (item.status === 'COMPLETED' ? '— Archive' : '⚡ Open Queue')}</td>
                          <td style={styles.tableBodyCell}>{item.allocated_instrument_id || '—'}</td>
                          <td style={{ ...styles.tableBodyCell, display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            {item.status === 'SCHEDULED_TODAY' && (
                              <button onClick={() => handleSimulateFailure(item.allocated_instrument_id)} style={styles.faultButton} className="ease-element">
                                💥 Fault
                              </button>
                            )}
                            {item.status !== 'COMPLETED' && (
                              <button 
                                onClick={() => handleExecuteCompleteness([item.source_system_ref])} 
                                style={styles.inlineCompleteBtn} 
                                className="ease-element"
                              >
                                ✓ Complete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>
            </div>

            {/* COLUMN 2 CONTROLS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '29px' }}>
              
              {/* NEW EXPANSION PANEL: MANUAL EXCEPTIONAL INGESTION ENTRY */}
              <section style={styles.glassCardPanel} className="ease-element">
                <h2 style={styles.panelTitle}>📥 Exceptional Manual Entry Ingestion</h2>
                <p style={{ fontSize: '14px', color: '#475569', marginTop: '-12px', marginBottom: '19px', lineHeight: '1.4' }}>
                  Bypass standard automated server pipeline ingestion parameters for isolated physical sample verification criteria.
                </p>
                <form onSubmit={handleManualPendingEntry} style={styles.formStructure}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Material Identifier / Lot Code</label>
                    <input 
                      type="text"
                      placeholder="e.g., LOT-992-METH"
                      value={manualMaterialCode}
                      onChange={(e) => setManualMaterialCode(e.target.value)}
                      style={styles.glassInput}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Method Validation Target / Test Directive</label>
                    <input 
                      type="text"
                      placeholder="e.g., SOP-METHOD-HPLC-05"
                      value={manualTestDirective}
                      onChange={(e) => setManualTestDirective(e.target.value)}
                      style={styles.glassInput}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Calculated Matrix SLA Priority Tier</label>
                    <select 
                      style={styles.glassDropdown}
                      value={manualSlaTier}
                      onChange={(e) => setManualSlaTier(e.target.value)}
                    >
                      <option value="LOW">Low Turnaround Urgency (Class C)</option>
                      <option value="MEDIUM">Medium Standard Urgency (Class B)</option>
                      <option value="CRITICAL">Critical Direct Action (Class A)</option>
                    </select>
                  </div>
                  <button type="submit" style={styles.manualEntryBtn} className="ease-element">
                    📥 Commit Exceptional Sample Record
                  </button>
                </form>
              </section>

              {/* OVERRIDE MANAGEMENT PANEL */}
              <section style={styles.glassCardPanel} className="ease-element">
                <h2 style={styles.panelTitle}>🎛️ Manual Assignment Override</h2>
                <form onSubmit={handleManualDispatch} style={styles.formStructure}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Target Queue Reference</label>
                    <select style={styles.glassDropdown} value={formSelectedTask} onChange={(e) => setFormSelectedTask(e.target.value)}>
                      <option value="">-- Choose Open Pending Sample --</option>
                      {pendingItems.filter(i => i.status === 'AWAITING_ALLOCATION').map(i => (
                        <option key={i.id} value={i.source_system_ref}>
                          {i.source_system_ref} ({i.batch_lot_number})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Allocate Laboratory Analyst</label>
                    <select style={styles.glassDropdown} value={formSelectedAnalyst} onChange={(e) => setFormSelectedAnalyst(e.target.value)}>
                      <option value="">-- Choose Staff Target --</option>
                      {analysts.filter(a => a.is_available_today).map(a => (
                        <option key={a.employee_code} value={a.employee_code}>{a.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>Dedicate Hardware Instrument</label>
                    <select style={styles.glassDropdown} value={formSelectedInstrument} onChange={(e) => setFormSelectedInstrument(e.target.value)}>
                      <option value="">-- Choose Functional Node --</option>
                      {instruments.filter(i => i.status === 'AVAILABLE').map(i => (
                        <option key={i.instrument_serial_id} value={i.instrument_serial_id}>{i.model_make}</option>
                      ))}
                    </select>
                  </div>

                  {formMessage && (
                    <div style={{
                      ...styles.notificationBanner,
                      backgroundColor: formMessage.type === 'error' ? 'rgba(220,38,38,0.1)' : 'rgba(22,163,74,0.1)',
                      borderColor: formMessage.type === 'error' ? '#dc2626' : '#16a34a',
                      color: formMessage.type === 'error' ? '#991b1b' : '#14532d'
                    }}>
                      {formMessage.text}
                    </div>
                  )}
                  <button type="submit" style={styles.glassManualSubmitButton} className="ease-element">Dispatch Structural Routing Override</button>
                </form>
              </section>
            </div>
          </div>
        )}

        {/* ==========================================
            VIEW CONTEXT B: QA VIEWER PORTAL
           ========================================== */}
        {userRole === 'QA_VIEWER' && (
          <div style={styles.qaDashboardLayout} className="ease-element">
            
            {/* QA STATIC METRIC ROW */}
            <div style={styles.qaMetricsContainer}>
              <div style={styles.qaMetricCard} className="ease-element">
                <span style={styles.qaMetricLabel}>Audit Compliance Index</span>
                <h3 style={styles.qaMetricVal}>99.42%</h3>
                <span style={{...styles.statusBadge, backgroundColor: 'rgba(22,163,74,0.1)', color: '#16a34a'}}>✓ GLP Compliant</span>
              </div>
              <div style={styles.qaMetricCard} className="ease-element">
                <span style={styles.qaMetricLabel}>SLA Validation Thresholds</span>
                <h3 style={styles.qaMetricVal}>98.15%</h3>
                <span style={{...styles.statusBadge, backgroundColor: 'rgba(22,163,74,0.1)', color: '#16a34a'}}>In Tolerance Bounds</span>
              </div>
              <div style={styles.qaMetricCard} className="ease-element">
                <span style={styles.qaMetricLabel}>Active Certified Operators</span>
                <h3 style={styles.qaMetricVal}>{analysts.length} Records</h3>
                <span style={{...styles.statusBadge, backgroundColor: 'rgba(37,99,235,0.1)', color: '#2563eb'}}>IAM Monitored</span>
              </div>
              <div style={styles.qaMetricCard} className="ease-element">
                <span style={styles.qaMetricLabel}>Hardware Asset Nodes</span>
                <h3 style={styles.qaMetricVal}>{instruments.length} Nodes</h3>
                <span style={{...styles.statusBadge, backgroundColor: 'rgba(217,119,6,0.1)', color: '#d97706'}}>Calibration Checked</span>
              </div>
            </div>

            {/* TWO COLUMN STATIC LEDGER PANELS */}
            <div style={{display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '29px'}}>
              <section style={styles.glassCardPanel} className="ease-element">
                <h2 style={styles.panelTitle}>🛡️ Standard Operating Procedure (SOP) Validation Logs</h2>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.tableHeaderRow}>
                      <th style={styles.tableHeaderCell}>Timestamp</th>
                      <th style={styles.tableHeaderCell}>Audit Target Reference</th>
                      <th style={styles.tableHeaderCell}>Method Directive</th>
                      <th style={styles.tableHeaderCell}>Verification Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={styles.tableBodyRow}>
                      <td style={styles.tableBodyCell}>2026-06-09 14:22</td>
                      <td style={styles.tableBodyCell}><strong>LOT-B75-BIO</strong></td>
                      <td style={styles.tableBodyCell}>SOP-METHOD-HPLC-01</td>
                      <td style={styles.tableBodyCell}><span style={{color: '#16a34a', fontWeight: 'bold'}}>PASS</span></td>
                    </tr>
                    <tr style={styles.tableBodyRow}>
                      <td style={styles.tableBodyCell}>2026-06-09 11:05</td>
                      <td style={styles.tableBodyCell}><strong>LOT-Z91-CHEM</strong></td>
                      <td style={styles.tableBodyCell}>SOP-METHOD-MS-CORE</td>
                      <td style={styles.tableBodyCell}><span style={{color: '#16a34a', fontWeight: 'bold'}}>PASS</span></td>
                    </tr>
                    <tr style={styles.tableBodyRow}>
                      <td style={styles.tableBodyCell}>2026-06-08 17:41</td>
                      <td style={styles.tableBodyCell}><strong>LOT-T12-TOX</strong></td>
                      <td style={styles.tableBodyCell}>SOP-METHOD-TE-VAL</td>
                      <td style={styles.tableBodyCell}><span style={{color: '#16a34a', fontWeight: 'bold'}}>PASS</span></td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section style={styles.glassCardPanel} className="ease-element">
                <h2 style={styles.panelTitle}>⚙️ Dynamic Instrument Certification Matrix</h2>
                <div style={{display: 'flex', flexDirection: 'column', gap: '14px'}}>
                  <div style={styles.qaStaticRow}>
                    <div><strong>HPLC Array Node-Alpha</strong><br/><small style={{color:'#475569'}}>Serial ID: INST-LC-01</small></div>
                    <span style={{...styles.statusBadge, backgroundColor: 'rgba(22,163,74,0.15)', color: '#16a34a'}}>NIST Traceable</span>
                  </div>
                  <div style={styles.qaStaticRow}>
                    <div><strong>Mass Spectrometer Core</strong><br/><small style={{color:'#475569'}}>Serial ID: INST-MS-99</small></div>
                    <span style={{...styles.statusBadge, backgroundColor: 'rgba(22,163,74,0.15)', color: '#16a34a'}}>NIST Traceable</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {/* ==========================================
            VIEW CONTEXT C: SYSTEM ADMIN LAYOUT
           ========================================== */}
        {userRole === 'SYSTEM_ADMIN' && (
          <div style={styles.adminDashboardGrid} className="ease-element">
            <section style={styles.glassCardPanel} className="ease-element">
              <h2 style={styles.panelTitle}>🛠️ Administrative Core Engine</h2>
              <p style={{ fontSize: '16px', color: '#475569', lineHeight: '1.6', marginBottom: '24px' }}>
                <strong>Access Guardrail Enforced:</strong> Root administrators have structural data capabilities but are strictly segregated from invoking automated heuristic optimization loops.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button onClick={() => setAdminTab('IAM')} style={{...styles.adminNavButton, backgroundColor: adminTab === 'IAM' ? 'rgba(236,72,153,0.15)' : 'transparent', color: adminTab === 'IAM' ? '#db2777' : '#475569'}} className="ease-element">🔑 Identity & Access (IAM)</button>
                <button onClick={() => setAdminTab('CALENDAR')} style={{...styles.adminNavButton, backgroundColor: adminTab === 'CALENDAR' ? 'rgba(236,72,153,0.15)' : 'transparent', color: adminTab === 'CALENDAR' ? '#db2777' : '#475569'}} className="ease-element">📅 Calendars & Shift Boundaries</button>
                <button onClick={() => setAdminTab('RULES')} style={{...styles.adminNavButton, backgroundColor: adminTab === 'RULES' ? 'rgba(236,72,153,0.15)' : 'transparent', color: adminTab === 'RULES' ? '#db2777' : '#475569'}} className="ease-element">📐 SLA & Compatibility Matrices</button>
              </div>
            </section>

            <section style={styles.glassCardPanel} className="ease-element">
              {adminMessage && <div style={styles.adminSuccessToast} className="ease-element">{adminMessage}</div>}

              {adminTab === 'IAM' && (
                <div className="fade-in-entry">
                  <h3 style={styles.adminTabTitle}>Identity & Access Management (IAM)</h3>
                  <div style={styles.adminActionRowGrid}>
                    <div style={styles.adminInteractiveCard} className="ease-element">
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#0f172a' }}>✨ Provision Live Account</h4>
                      <label style={styles.formLabel}>Employee Code</label>
                      <input type="text" placeholder="e.g., ANALYST-99" value={adminNewUserCode} onChange={(e) => setAdminNewUserCode(e.target.value)} style={{ ...styles.glassInput, marginBottom: '12px' }} />
                      <label style={styles.formLabel}>Full Legal Name</label>
                      <input type="text" placeholder="e.g., Jonathan Doe" value={adminNewUserName} onChange={(e) => setAdminNewUserName(e.target.value)} style={styles.glassInput} />
                      <button onClick={() => handleAdminUserAction('CREATE')} style={{ ...styles.adminActionInlineBtn, backgroundColor: '#0f172a' }} className="ease-element">➕ Append Record</button>
                    </div>

                    <div style={styles.adminInteractiveCard} className="ease-element">
                      <h4 style={{ margin: '0 0 12px 0', fontSize: '16px', color: '#0f172a' }}>🔧 Manage Real Active Rows</h4>
                      <select style={styles.glassDropdown} value={adminTargetUser} onChange={(e) => setAdminTargetUser(e.target.value)}>
                        <option value="">-- Pick Profile --</option>
                        {analysts.map(analyst => (
                          <option key={analyst.employee_code} value={analyst.employee_code}>{analyst.full_name} ({analyst.employee_code})</option>
                        ))}
                      </select>
                      <button onClick={() => handleAdminUserAction('DISABLE')} style={{ ...styles.adminActionInlineBtn, backgroundColor: '#d97706' }} className="ease-element">Disable Row</button>
                    </div>
                  </div>
                </div>
              )}

              {adminTab === 'CALENDAR' && (
                <div className="fade-in-entry">
                  <h3 style={styles.adminTabTitle}>Shift-Time & Holiday Boundary Mappings</h3>
                  <div style={styles.adminActionRowGrid}>
                    <div style={styles.adminInteractiveCard} className="ease-element">
                      <h4>Shift Roster Definition Templates</h4>
                      <select style={styles.glassDropdown} value={adminShiftCode} onChange={(e) => setAdminShiftCode(e.target.value)}>
                        <option value="SHIFT_A">Shift Alpha Framework (Core Morning)</option>
                        <option value="SHIFT_B">Shift Beta Framework (Core Evening)</option>
                      </select>
                      <button onClick={() => handleAdminCalendarAction('SHIFT')} style={styles.adminActionInlineBtn} className="ease-element">Publish Window</button>
                    </div>
                  </div>
                </div>
              )}

              {adminTab === 'RULES' && (
                <div className="fade-in-entry">
                  <h3 style={styles.adminTabTitle}>SLA Classifications & Capability Vectors</h3>
                  <div style={styles.adminActionRowGrid}>
                    <div style={styles.adminInteractiveCard} className="ease-element">
                      <h4>SLA Durations Configuration</h4>
                      <button onClick={() => handleAdminRulesAction('SLA')} style={styles.adminActionInlineBtn} className="ease-element">Commit SLA Parameters</button>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

      </div>
    </div>
  );
}

// =======================================================================
// KEYFRAME ANIMATION MATRIX STRINGS (INCLUDES GRADIENT FLOATING ORBS)
// =======================================================================
const inlineAnimations = `
  @keyframes rotateCube {
    0% { transform: rotateX(0deg) rotateY(0deg); }
    100% { transform: rotateX(360deg) rotateY(360deg); }
  }
  @keyframes revolvingBorder {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes floatAmbient {
    0% { transform: translateY(0px) scale(1); }
    50% { transform: translateY(-30px) scale(1.08); }
    100% { transform: translateY(0px) scale(1); }
  }
  .solid-cube {
    animation: rotateCube 20s infinite linear;
  }
  .revolving-card-perimeter::before {
    content: '';
    position: absolute;
    width: 140%;
    height: 140%;
    background: conic-gradient(#3b82f6, #ec4899, #0d9488, #6366f1, #3b82f6);
    animation: revolvingBorder 6s infinite linear;
    z-index: 0;
    top: -20%;
    left: -20%;
  }
  .design-orb-1 {
    animation: floatAmbient 12s infinite ease-in-out;
  }
  .design-orb-2 {
    animation: floatAmbient 16s infinite ease-in-out alternate;
  }
  .fade-in-entry {
    animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  .ease-element {
    transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1) !important;
  }
  .ease-element:hover {
    transform: translateY(-2px);
    box-shadow: 0 16px 38px rgba(31, 38, 135, 0.08) !important;
  }
`;

// =======================================================================
// PREMIUM LUMINANCE STYLE MATRIX (WITH EXPANSION FIELDS)
// =======================================================================
const styles = {
  ambientWrapper: {
    minHeight: '100vh',
    backgroundImage: 'radial-gradient(at 0% 0%, #e0e7ff 0px, transparent 45%), radial-gradient(at 100% 0%, #fce7f3 0px, transparent 45%), radial-gradient(at 100% 100%, #eff6ff 0px, transparent 50%)',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '38px 29px',
    boxSizing: 'border-box' as const,
    position: 'relative' as const,
    overflowX: 'hidden' as const,
  },
  bokehOrb: {
    position: 'absolute' as const,
    borderRadius: '50%',
    filter: 'blur(50px)',
    zIndex: 0,
    pointerEvents: 'none' as const
  },
  cubeContainer: {
    position: 'absolute' as const,
    width: '400px',
    height: '400px',
    top: '12%',
    left: '8%',
    perspective: '1000px',
    zIndex: 1,
    pointerEvents: 'none' as const
  },
  solidCube: {
    width: '200px',
    height: '200px',
    position: 'relative' as const,
    transformStyle: 'preserve-3d' as const,
  },
  cubeFace: {
    position: 'absolute' as const,
    width: '200px',
    height: '200px',
    border: '2px solid rgba(255,255,255,0.7)',
    backdropFilter: 'blur(8px)',
    boxShadow: 'inset 0 0 30px rgba(255,255,255,0.2)'
  },
  revolvingPerimeterOuter: {
    position: 'relative' as const,
    width: '100%',
    maxWidth: '532px',
    padding: '4px',
    borderRadius: '33px',
    overflow: 'hidden' as const,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    boxShadow: '0 30px 60px -15px rgba(0,0,0,0.15)'
  },
  loginCard: {
    position: 'relative' as const,
    zIndex: 1,
    width: '100%',
    padding: '48px',     
    borderRadius: '29px', 
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    backdropFilter: 'blur(36px) saturate(190%)',
    boxSizing: 'border-box' as const,
  },
  loginHeaderGrid: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', marginBottom: '38px' },
  logoBadge: { padding: '10px 17px', backgroundColor: '#0f172a', color: '#ffffff', borderRadius: '12px', fontSize: '16px', fontWeight: 'bold', marginBottom: '14px' },
  loginTitle: { fontSize: '31px', fontWeight: '800', margin: 0, color: '#0f172a', letterSpacing: '-0.6px' },
  loginSubtitle: { fontSize: '16px', color: '#475569', marginTop: '7px', margin: 0 },
  
  glassInput: {
    width: '100%',
    padding: '14px 17px', 
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    borderRadius: '12px',
    color: '#0f172a',
    fontSize: '17px', 
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  glassDropdown: {
    width: '100%',
    padding: '14px 17px',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    border: '1px solid rgba(15, 23, 42, 0.12)',
    borderRadius: '12px',
    color: '#0f172a',
    fontSize: '17px',
    outline: 'none',
    boxSizing: 'border-box' as const,
    cursor: 'pointer'
  },
  authErrorAlert: { padding: '12px', borderRadius: '10px', backgroundColor: 'rgba(220,38,38,0.06)', border: '1px solid #f87171', color: '#b91c1c', fontSize: '16px', textAlign: 'center' as const },
  glassSubmitButton: { width: '100%', padding: '17px', backgroundColor: '#0f172a', border: 'none', borderRadius: '12px', color: '#ffffff', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '17px', marginTop: '10px', boxShadow: '0 12px 24px -6px rgba(15,23,42,0.2)' },
  
  dashboardContainer: { width: '100%', maxWidth: '1728px', display: 'flex', flexDirection: 'column' as const, gap: '29px', position: 'relative' as const, zIndex: 1 },
  glassHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.5)', border: '1px solid rgba(255, 255, 255, 0.6)', borderRadius: '24px', padding: '29px', backdropFilter: 'blur(30px)', boxShadow: '0 10px 38px rgba(31,38,135,0.04)' },
  liveIndicator: { width: '12px', height: '12px', borderRadius: '50%', display: 'inline-block' },
  mainTitle: { fontSize: '26px', fontWeight: '800', margin: 0, color: '#0f172a', letterSpacing: '-0.6px' },
  subTitle: { fontSize: '16px', color: '#475569', margin: '5px 0 0 0' },
  userTag: { fontSize: '16px', color: '#1e293b', fontWeight: '600', backgroundColor: 'rgba(255,255,255,0.6)', padding: '7px 17px', borderRadius: '24px', border: '1px solid rgba(15, 23, 42, 0.08)' },
  glassEngineButton: { padding: '14px 24px', borderRadius: '12px', color: '#ffffff', border: 'none', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '16px' },
  glassLogoutButton: { padding: '14px 24px', backgroundColor: 'rgba(15, 23, 42, 0.08)', borderRadius: '12px', color: '#0f172a', border: '1px solid rgba(15, 23, 42, 0.15)', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '16px' },
  
  dashboardGrid: { display: 'grid', gridTemplateColumns: '2.2fr 1fr', gap: '29px', width: '100%' },
  adminDashboardGrid: { display: 'grid', gridTemplateColumns: '1fr 2.5fr', gap: '29px', width: '100%' },
  glassCardPanel: { backgroundColor: 'rgba(255, 255, 255, 0.45)', border: '1px solid rgba(255, 255, 255, 0.6)', backdropFilter: 'blur(36px)', borderRadius: '24px', padding: '34px', boxShadow: '0 12px 48px -12px rgba(31, 38, 135, 0.05)' },
  panelTitle: { fontSize: '20px', fontWeight: '800', marginTop: 0, marginBottom: '24px', borderBottom: '1px solid rgba(15,23,42,0.06)', paddingBottom: '14px', color: '#0f172a' },
  panelInlineTitle: { fontSize: '14px', fontWeight: '700', marginTop: 0, marginBottom: '17px', color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.6px' },
  
  filterGridContainer: { display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '19px' },
  
  table: { width: '100%', borderCollapse: 'collapse' as const, textAlign: 'left' as const },
  tableHeaderRow: { borderBottom: '2px solid rgba(15,23,42,0.08)' },
  tableHeaderCell: { padding: '14px 12px', fontSize: '13px', textTransform: 'uppercase' as const, color: '#475569', fontWeight: '700' },
  tableBodyRow: { borderBottom: '1px solid rgba(15,23,42,0.05)' },
  tableBodyCell: { padding: '17px 12px', fontSize: '16px', color: '#1e293b' },
  emptyRow: { padding: '29px', textAlign: 'center' as const, color: '#64748b', fontSize: '16px' },
  statusBadge: { padding: '5px 12px', borderRadius: '7px', fontSize: '13px', fontWeight: '700' as const },
  
  checkboxStyle: { width: '18px', height: '18px', cursor: 'pointer', accentColor: '#3b82f6' },
  bulkCompleteButton: { padding: '10px 19px', backgroundColor: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 'bold' as const, cursor: 'pointer', boxShadow: '0 8px 16px rgba(0,0,0,0.1)' },
  inlineCompleteBtn: { padding: '5px 12px', backgroundColor: 'rgba(13,148,136,0.1)', border: '1px solid rgba(13,148,136,0.3)', color: '#0d9488', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: '700' as const },
  faultButton: { padding: '5px 12px', backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', color: '#dc2626', borderRadius: '7px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' as const },
  manualEntryBtn: { width: '100%', padding: '14px', backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '12px', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '15px', marginTop: '7px', boxShadow: '0 8px 20px -4px rgba(79,70,229,0.3)' },
  
  formStructure: { display: 'flex', flexDirection: 'column' as const, gap: '22px' },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '7px' },
  formLabel: { fontSize: '13px', color: '#475569', fontWeight: '700', textTransform: 'uppercase' as const, letterSpacing: '0.6px' },
  notificationBanner: { padding: '14px', borderRadius: '10px', borderWidth: '1px', borderStyle: 'solid' as const, fontSize: '16px' },
  glassManualSubmitButton: { marginTop: '12px', width: '100%', padding: '17px', backgroundColor: '#0d9488', border: 'none', borderRadius: '12px', color: '#ffffff', fontWeight: 'bold' as const, cursor: 'pointer', fontSize: '16px' },
  
  adminNavButton: { width: '100%', padding: '17px 19px', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '700' as const, textAlign: 'left' as const, cursor: 'pointer' },
  adminTabTitle: { fontSize: '24px', fontWeight: '800', margin: '0 0 7px 0', color: '#0f172a' },
  adminActionRowGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' },
  adminInteractiveCard: { backgroundColor: 'rgba(255,255,255,0.4)', border: '1px solid rgba(15,23,42,0.06)', padding: '24px', borderRadius: '17px' },
  adminActionInlineBtn: { width: '100%', marginTop: '17px', padding: '14px', backgroundColor: '#ec4899', color: '#ffffff', fontWeight: '700' as const, border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '16px' },
  adminSuccessToast: { padding: '14px 19px', backgroundColor: 'rgba(22,163,74,0.1)', border: '1px solid #16a34a', color: '#14532d', borderRadius: '12px', fontSize: '16px', fontWeight: '600' as const, marginBottom: '24px' },

  qaDashboardLayout: { display: 'flex', flexDirection: 'column' as const, gap: '29px', width: '100%' },
  qaMetricsContainer: { display: 'grid' as const, gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '24px' },
  qaMetricCard: { backgroundColor: 'rgba(255, 255, 255, 0.55)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: '20px', padding: '24px', backdropFilter: 'blur(20px)' },
  qaMetricLabel: { fontSize: '13px', color: '#475569', textTransform: 'uppercase' as const, fontWeight: '700', letterSpacing: '0.5px' },
  qaMetricVal: { fontSize: '29px', fontWeight: '900', margin: '8px 0', color: '#0f172a' },
  qaStaticRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: '12px', border: '1px solid rgba(15,23,42,0.04)' }
};