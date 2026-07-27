import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/shifts?departmentId=X
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get('departmentId');

  if (!departmentId) {
    return NextResponse.json({ error: 'departmentId query param is required' }, { status: 400 });
  }

  // Fetch with all fields — try new schema, fall back to old
  const { data, error } = await supabase
    .from('ShiftTemplate')
    .select('id, name, durationHours, shiftType, startTime, endTime, requiredSeniorsCount, requiredJuniorsCount, departmentId')
    .eq('departmentId', departmentId)
    .order('name', { ascending: true });

  if (error) {
    // Fall back to old schema
    const { data: fallback, error: fallbackErr } = await supabase
      .from('ShiftTemplate')
      .select('id, name, durationHours, departmentId')
      .eq('departmentId', departmentId)
      .order('name', { ascending: true });

    if (fallbackErr) {
      return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
    }

    return NextResponse.json(fallback ?? []);
  }

  return NextResponse.json(data ?? []);
}
