import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { addDays, parseISO, startOfDay, endOfDay } from 'date-fns';

// GET /api/roster?departmentId=X&weekStart=ISO_DATE
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get('departmentId');
  const weekStart = searchParams.get('weekStart');

  if (!departmentId || !weekStart) {
    return NextResponse.json(
      { error: 'departmentId and weekStart query params are required' },
      { status: 400 }
    );
  }

  const startDate = startOfDay(parseISO(weekStart));
  const endDate = endOfDay(addDays(startDate, 6));

  const { data, error } = await supabase
    .from('RosterEntry')
    .select('id, date, userId, shiftName, startTime, endTime, user:User(name, role)')
    .gte('date', startDate.toISOString())
    .lte('date', endDate.toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten the user join
  const entries = (data ?? []).map((entry: any) => ({
    id: entry.id,
    date: entry.date,
    userId: entry.userId,
    userName: entry.user?.name ?? 'Unknown',
    userRole: entry.user?.role ?? 'Unknown',
    shiftName: entry.shiftName,
    startTime: entry.startTime,
    endTime: entry.endTime,
  }));

  // Filter by department: only return entries where user belongs to the department
  const { data: deptUsers } = await supabase
    .from('User')
    .select('id')
    .eq('departmentId', departmentId);

  const deptUserIds = new Set((deptUsers ?? []).map((u: any) => u.id));
  const filtered = entries.filter((e: any) => deptUserIds.has(e.userId));

  return NextResponse.json(filtered);
}

// POST /api/roster — create a single roster entry
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId, date, shiftName, startTime, endTime } = body;

  if (!userId || !date || !shiftName || !startTime || !endTime) {
    return NextResponse.json(
      { error: 'Missing required fields: userId, date, shiftName, startTime, endTime' },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from('RosterEntry')
    .insert({
      userId,
      date,
      shiftName,
      startTime,
      endTime,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/roster?id=ENTRY_ID
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
  }

  const { error } = await supabase.from('RosterEntry').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
