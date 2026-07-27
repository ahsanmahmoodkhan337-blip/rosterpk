import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get('departmentId');

  if (!departmentId) {
    return NextResponse.json({ error: 'departmentId query param is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('User')
    .select('id, name, phone, role')
    .eq('departmentId', departmentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
