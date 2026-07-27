import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get('departmentId');

  if (!departmentId) {
    return NextResponse.json({ error: 'departmentId query param is required' }, { status: 400 });
  }

  // Try with new schema fields first (rank), fall back to old schema
  let { data, error } = await supabase
    .from('User')
    .select('id, name, phone, role, rank')
    .eq('departmentId', departmentId);

  if (error) {
    // Fall back to old schema (no rank column)
    const { data: fallback, error: fallbackErr } = await supabase
      .from('User')
      .select('id, name, phone, role')
      .eq('departmentId', departmentId);

    if (fallbackErr) {
      return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
    }

    return NextResponse.json(fallback ?? []);
  }

  return NextResponse.json(data ?? []);
}
