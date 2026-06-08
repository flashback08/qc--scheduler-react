import { NextResponse } from 'next/server';
import { runAutomatedScheduler } from '../../../lib/schedulerEngine';

// Forces Next.js to always execute this fresh without caching old schedules
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    // 1. Invoke the heuristic engine calculation loop
    const result = await runAutomatedScheduler();

    // 2. Return the calculation log matrix back to the frontend dashboard
    if (result.success) {
      return NextResponse.json({ success: true, log: result.log });
    } else {
      return NextResponse.json({ success: false, log: result.log }, { status: 422 });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, log: `Internal Server Gateway Error: ${error.message}` },
      { status: 500 }
    );
  }
}