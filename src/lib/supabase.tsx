import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'PRIMARY_PLANNER' | 'BACKUP_PLANNER' | 'ADMIN' | 'QA_VIEWER';

export interface Material {
  material_code: string;
  material_name: string;
  category: string;
  sla_duration_hours: number;
}

export interface Instrument {
  instrument_serial_id: string;
  instrument_type: string;
  model_make: string;
  lab_section: string;
  status: string;
}

export interface Analyst {
  employee_code: string;
  full_name: string;
  primary_section: string;
  is_available_today: boolean;
}

export interface PendingJob {
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