import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/shifts?departmentId=X
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get('departmentId');

  if (!departmentId) {
    return NextResponse.json({ error: 'departmentId query param is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('ShiftTemplate')
    .select('id, name, durationHours, departmentId')
    .eq('departmentId', departmentId)
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
