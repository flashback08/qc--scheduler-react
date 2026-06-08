import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function runAutomatedScheduler() {
  const logs: string[] = [];
  logs.push(`[${new Date().toISOString()}] Starting heuristic optimization routine...`);

  try {
    // 1. FETCH LIVE DATA USING YOUR EXACT SCHEMA COLUMNS
    const { data: tasks } = await supabase
      .from('pending_list')
      .select('*')
      .eq('status', 'AWAITING_ALLOCATION') // ⚡ Look for your real enum value
      .eq('lock_execution', false)
      .order('urgency_score', { ascending: false });

    const { data: analysts } = await supabase
      .from('analysts')
      .select('*')
      .eq('is_available_today', true);

    const { data: instruments } = await supabase
      .from('instruments')
      .select('*')
      .eq('status', 'AVAILABLE');

    if (!tasks || tasks.length === 0) {
      logs.push("Optimization complete: No tasks currently 'AWAITING_ALLOCATION'.");
      return { success: true, log: logs.join('\n') };
    }

    logs.push(`Found ${tasks.length} open tasks, ${analysts?.length || 0} analysts, and ${instruments?.length || 0} instruments.`);

    // Local mutable pools for matching tracking
    let availableInstruments = [...(instruments || [])];
    let availableAnalysts = [...(analysts || [])];

    // 2. RUN THE MATCHING ALGORITHM
    for (const task of tasks) {
      // Find a matching instrument for the task type
      const instrumentIndex = availableInstruments.findIndex(i => i.status === 'AVAILABLE');
      // Find any available analyst
      const analystIndex = availableAnalysts.findIndex(a => a.is_available_today === true);

      if (instrumentIndex !== -1 && analystIndex !== -1) {
        const allocatedInst = availableInstruments[instrumentIndex];
        const allocatedAnalyst = availableAnalysts[analystIndex];

        logs.push(`Matching ${task.source_system_ref} -> Analyst: ${allocatedAnalyst.employee_code}, Inst: ${allocatedInst.instrument_serial_id}`);

        // 3. COMMIT UPDATES TO THE DATABASE WITH CORRECT FIELDS
        await supabase
          .from('pending_list')
          .update({
            status: 'SCHEDULED_TODAY', // ⚡ Map to your real scheduled enum
            allocated_analyst_code: allocatedAnalyst.employee_code, // ⚡ Schema correct
            allocated_instrument_id: allocatedInst.instrument_serial_id, // ⚡ Schema correct
          })
          .eq('id', task.id);

        // Optional: Update the instrument status to busy/in use if desired
        // For now, remove them from the local loop pool to prevent double booking
        availableInstruments.splice(instrumentIndex, 1);
        availableAnalysts.splice(analystIndex, 1);
      } else {
        logs.push(`Task ${task.source_system_ref} skipped: Deficit of available personnel or hardware nodes.`);
      }
    }

    logs.push("Heuristic scheduling run finalized cleanly.");
    return { success: true, log: logs.join('\n') };

  } catch (error: any) {
    return { success: false, log: `Critical Engine Failure: ${error.message}` };
  }
}