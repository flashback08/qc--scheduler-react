'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client Safely
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function SchedulerDashboard() {
  // --- APPLICATION STATES ---
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [analysts, setAnalysts] = useState<any[]>([]);
  const [instruments, setInstruments] = useState<any[]>([]);

  // Form Dropdown Selections
  const [formSelectedTask, setFormSelectedTask] = useState('');
  const [formSelectedAnalyst, setFormSelectedAnalyst] = useState('');
  const [formSelectedInstrument, setFormSelectedInstrument] = useState('');

  // UI Status Flags
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [engineLog, setEngineLog] = useState('');
  const [formMessage, setFormMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // --- INITIAL DATA FETCH ---
  const fetchCoreData = async () => {
    try {
      // 1. Fetch live queue positions
      const { data: tasksData, error: e1 } = await supabase
        .from('pending_list')
        .select('*')
        .order('urgency_score', { ascending: false });
      if (e1) throw e1;
      setPendingItems(tasksData || []);

      // 2. Fetch available lab personnel 
      const { data: analystsData, error: e2 } = await supabase
        .from('analysts')
        .select('*')
        .eq('is_available_today', true);
      if (e2) throw e2;
      setAnalysts(analystsData || []);

      // 3. Fetch online hardware equipment nodes
      const { data: instrumentsData, error: e3 } = await supabase
        .from('instruments')
        .select('*')
        .eq('status', 'AVAILABLE');
      if (e3) throw e3;
      setInstruments(instrumentsData || []);

    } catch (err: any) {
      console.error('Data pipeline loading error:', err.message);
    }
  };

  useEffect(() => {
    fetchCoreData();

    // --- REALTIME WEBSOCKET SUBSCRIPTION CHANNEL ---
    const realTimeChannel = supabase
      .channel('prd-stable-channel')
      .on(
        'postgres_changes',
        { event: '*', package: 'public', schema: 'public', table: 'pending_list' },
        () => { fetchCoreData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', package: 'public', schema: 'public', table: 'instruments' },
        () => { fetchCoreData(); }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(realTimeChannel);
    };
  }, []);

  // --- TRIGGER AUTO-OPTIMIZATION ENGINE ---
  const handleInvokeEngine = async () => {
    setIsOptimizing(true);
    setEngineLog('Initializing optimization calculations...');
    try {
      const response = await fetch('/api/trigger-scheduler', { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        setEngineLog(data.log || 'Optimization complete. Matrix updated successfully.');
      } else {
        setEngineLog(`Optimization skipped or failed:\n${data.log}`);
      }
    } catch (error: any) {
      setEngineLog(`Network gateway breakdown: ${error.message}`);
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- SUBMIT MANUAL ASSIGNMENT OVERRIDE ---
  const handleManualDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMessage(null);

    // Strict UI Validation Guardrail
    if (!formSelectedTask || !formSelectedAnalyst || !formSelectedInstrument) {
      setFormMessage({
        type: 'error',
        text: 'Validation Error: Form allocation slots must be completely filled.',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('pending_list')
        .update({
          allocated_analyst_code: formSelectedAnalyst,
          allocated_instrument_id: formSelectedInstrument,
          status: 'SCHEDULED_TODAY', // Matches your validated Enum rule
          lock_execution: true,
          scheduled_start_time: new Date().toISOString()
        })
        .eq('source_system_ref', formSelectedTask);

      if (error) throw error;

      setFormMessage({ type: 'success', text: 'Deployment command dispatched successfully!' });
      
      // Reset form controls
      setFormSelectedTask('');
      setFormSelectedAnalyst('');
      setFormSelectedInstrument('');
    } catch (err: any) {
      setFormMessage({ type: 'error', text: `Database Refusal: ${err.message}` });
    }
  };

  // --- SIMULATE INSTRUMENT FAILURE INTERRUPTION ---
  const handleSimulateFailure = async (instrumentId: string) => {
    if (!instrumentId) return;
    try {
      await supabase
        .from('instruments')
        .update({ status: 'DOWN' }) // Flag resource as offline
        .eq('instrument_serial_id', instrumentId);

      // Un-schedule the task so it re-enters the backlog
      await supabase
        .from('pending_list')
        .update({
          status: 'AWAITING_ALLOCATION',
          allocated_analyst_code: null,
          allocated_instrument_id: null,
          lock_execution: false
        })
        .eq('allocated_instrument_id', instrumentId);

      alert(`Instrument ${instrumentId} flagged as DOWN. Task dropped back to backlog.`);
    } catch (err: any) {
      console.error(err.message);
    }
  };

  return (
    <div style={styles.dashboardContainer}>
      {/* HEADER NODAL BAR */}
      <header style={styles.header}>
        <div>
          <h1 style={styles.mainTitle}>Automated Labor Allocation Hub</h1>
          <p style={styles.subTitle}>Production Execution & Resource Distribution Matrix</p>
        </div>
        <button 
          onClick={handleInvokeEngine} 
          disabled={isOptimizing} 
          style={{...styles.engineButton, backgroundColor: isOptimizing ? '#475569' : '#2563eb'}}
        >
          {isOptimizing ? '🔄 Running Optimizations...' : '🚀 Invoke Algorithmic Optimization'}
        </button>
      </header>

      {/* CORE MATRIX INTERFACE */}
      <div style={styles.dashboardGrid}>
        
        {/* LEFT COLUMN: LIVE SCHEDULER VIEW */}
        <section style={styles.panelCard}>
          <h2 style={styles.panelTitle}>📊 Deployment Live Matrix</h2>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeaderRow}>
                <th style={styles.tableHeaderCell}>Source Ref</th>
                <th style={styles.tableHeaderCell}>Lot Nu.</th>
                <th style={styles.tableHeaderCell}>Urgency</th>
                <th style={styles.tableHeaderCell}>Current Status</th>
                <th style={styles.tableHeaderCell}>Assigned Analyst</th>
                <th style={styles.tableHeaderCell}>Hardware Node</th>
                <th style={styles.tableHeaderCell}>Interruption</th>
              </tr>
            </thead>
            <tbody>
              {pendingItems.length === 0 ? (
                <tr>
                  <td colSpan={7} style={styles.emptyRow}>No active records in operational pipeline memory.</td>
                </tr>
              ) : (
                pendingItems.map((item) => (
                  <tr key={item.id} style={styles.tableBodyRow}>
                    <td style={styles.tableBodyCell}><strong>{item.source_system_ref}</strong></td>
                    <td style={styles.tableBodyCell}>{item.batch_lot_number}</td>
                    <td style={styles.tableBodyCell}>{item.urgency_score ?? 0}</td>
                    <td style={styles.tableBodyCell}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: item.status === 'SCHEDULED_TODAY' ? '#16a34a' : '#1e3a8a'
                      }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={styles.tableBodyCell}>{item.allocated_analyst_code || '⚡ Unscheduled Backlog'}</td>
                    <td style={styles.tableBodyCell}>{item.allocated_instrument_id || '—'}</td>
                    <td style={styles.tableBodyCell}>
                      {item.status === 'SCHEDULED_TODAY' && (
                        <button 
                          onClick={() => handleSimulateFailure(item.allocated_instrument_id)} 
                          style={styles.faultButton}
                        >
                          💥 Fault
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* ENGINE LOG VIEWER CONTAINER */}
          {engineLog && (
            <div style={styles.logContainer}>
              <h4 style={{ margin: '0 0 5px 0', fontSize: '12px', color: '#38bdf8' }}>Engine Execution Logs:</h4>
              <pre style={styles.logText}>{engineLog}</pre>
            </div>
          )}
        </section>

        {/* RIGHT COLUMN: OVERRIDE DISPATCH CONTROLLER */}
        <section style={styles.panelCard}>
          <h2 style={styles.panelTitle}>🎛️ Manual Assignment Override</h2>
          
          <form onSubmit={handleManualDispatch} style={styles.formStructure}>
            
            {/* Field 1: Task Selection */}
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Target Queue Reference</label>
              <select 
                style={styles.formInputDropdown}
                value={formSelectedTask}
                onChange={(e) => setFormSelectedTask(e.target.value)}
              >
                <option value="">-- Choose Open Pending Sample --</option>
                {pendingItems.filter(i => i.status === 'AWAITING_ALLOCATION').map(i => (
                  <option key={i.id} value={i.source_system_ref}>
                    {i.source_system_ref} ({i.batch_lot_number})
                  </option>
                ))}
              </select>

              {/* 🔍 HARD DIAGNOSTIC COUNTER MODULE */}
              <div style={styles.diagnosticTracker}>
                Diagnostic: Loaded {pendingItems.length} records from DB 
                ({pendingItems.filter(i => i.status === 'AWAITING_ALLOCATION').length} are AWAITING_ALLOCATION)
              </div>
            </div>

            {/* Field 2: Analyst Assignment */}
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Allocate Laboratory Analyst</label>
              <select 
                style={styles.formInputDropdown}
                value={formSelectedAnalyst}
                onChange={(e) => setFormSelectedAnalyst(e.target.value)}
              >
                <option value="">-- Choose Staff Target --</option>
                {analysts.map(a => (
                  <option key={a.employee_code} value={a.employee_code}>
                    {a.full_name} [{a.employee_code}]
                  </option>
                ))}
              </select>
            </div>

            {/* Field 3: Instrument Selection */}
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Dedicate Hardware Instrument</label>
              <select 
                style={styles.formInputDropdown}
                value={formSelectedInstrument}
                onChange={(e) => setFormSelectedInstrument(e.target.value)}
              >
                <option value="">-- Choose Functional Node --</option>
                {instruments.map(i => (
                  <option key={i.instrument_serial_id} value={i.instrument_serial_id}>
                    {i.model_make} ({i.instrument_serial_id})
                  </option>
                ))}
              </select>
            </div>

            {/* Form Response Notification Banner */}
            {formMessage && (
              <div style={{
                ...styles.notificationBanner,
                backgroundColor: formMessage.type === 'error' ? '#7f1d1d' : '#14532d',
                borderColor: formMessage.type === 'error' ? '#f87171' : '#4ade80'
              }}>
                {formMessage.text}
              </div>
            )}

            <button type="submit" style={styles.submitButton}>
              Dispatch Manual Control Run
            </button>
          </form>
        </section>

      </div>
    </div>
  );
}

// --- MONOCHROME INDUSTRIAL DESIGN STYLING MATRIX ---
const styles = {
  dashboardContainer: { minHeight: '100vh', backgroundColor: '#0f172a', color: '#f8fafc', padding: '24px', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '16px', marginBottom: '24px' },
  mainTitle: { fontSize: '24px', fontWeight: 'bold', margin: 0, color: '#f1f5f9' },
  subTitle: { fontSize: '14px', color: '#94a3b8', margin: '4px 0 0 0' },
  engineButton: { padding: '10px 20px', borderRadius: '6px', color: '#ffffff', border: 'none', fontWeight: 'bold', cursor: 'pointer', transition: 'background-color 0.2s' },
  dashboardGrid: { display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' },
  panelCard: { backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', padding: '20px' },
  panelTitle: { fontSize: '18px', fontWeight: '6px', marginTop: 0, marginBottom: '16px', borderBottom: '1px solid #334155', paddingBottom: '8px', color: '#e2e8f0' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left' as const },
  tableHeaderRow: { borderBottom: '2px solid #475569' },
  tableHeaderCell: { padding: '10px', fontSize: '12px', textTransform: 'uppercase' as const, color: '#94a3b8', fontWeight: 'bold' },
  tableBodyRow: { borderBottom: '1px solid #334155', transition: 'background-color 0.15s', ':hover': { backgroundColor: '#334155' } },
  tableBodyCell: { padding: '12px 10px', fontSize: '14px', color: '#cbd5e1' },
  emptyRow: { padding: '20px', textAlignment: 'center' as const, color: '#64748b', fontSize: '14px' },
  statusBadge: { padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', color: '#ffffff' },
  faultButton: { padding: '3px 8px', backgroundColor: '#991b1b', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' },
  logContainer: { marginTop: '20px', backgroundColor: '#020617', padding: '12px', borderRadius: '6px', border: '1px solid #1e293b' },
  logText: { margin: 0, fontSize: '11px', color: '#a7f3d0', whiteSpace: 'pre-wrap' as const, fontFamily: 'monospace' },
  formStructure: { display: 'flex', flexDirection: 'column' as const, gap: '16px' },
  formGroup: { display: 'flex', flexDirection: 'column' as const, gap: '6px' },
  formLabel: { fontSize: '13px', color: '#94a3b8', fontWeight: '500' },
  formInputDropdown: { backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '6px', padding: '10px', color: '#f8fafc', fontSize: '14px', outline: 'none' },
  diagnosticTracker: { fontSize: '11px', color: '#64748b', marginTop: '4px' },
  notificationBanner: { padding: '12px', borderRadius: '6px', borderWidth: '1px', borderStyle: 'solid', fontSize: '13px', color: '#ffffff' },
  submitButton: { marginTop: '10px', width: '100%', padding: '12px', backgroundColor: '#0d9488', border: 'none', borderRadius: '6px', color: '#ffffff', fontWeight: 'bold', cursor: 'pointer' }
};