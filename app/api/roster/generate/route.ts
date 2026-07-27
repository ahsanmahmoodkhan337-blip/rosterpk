import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateDraftRoster } from '@/lib/scheduler';
import { parseISO, addDays, startOfDay, endOfDay } from 'date-fns';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { departmentId, startDate, days } = body;

  if (!departmentId || !startDate || !days) {
    return NextResponse.json(
      { error: 'Missing required fields: departmentId, startDate, days' },
      { status: 400 }
    );
  }

  const start = parseISO(startDate);
  const end = addDays(start, days);

  // Clear existing entries for this department and date range before generating
  // First get the users in this department
  const { data: deptUsers } = await supabase
    .from('User')
    .select('id')
    .eq('departmentId', departmentId);
  const deptUserIds = (deptUsers ?? []).map((u: any) => u.id);

  if (deptUserIds.length > 0) {
    const { error: deleteErr } = await supabase
      .from('RosterEntry')
      .delete()
      .in('userId', deptUserIds)
      .gte('date', startOfDay(start).toISOString())
      .lte('date', endOfDay(end).toISOString());

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }
  }

  try {
    const entries = await generateDraftRoster(departmentId, start, days);

    // Fetch the generated entries to return with user info
    const { data: generated, error: fetchErr } = await supabase
      .from('RosterEntry')
      .select('id, date, userId, shiftName, startTime, endTime, user:User(name, role)')
      .in('userId', deptUserIds)
      .gte('date', startOfDay(start).toISOString())
      .lte('date', endOfDay(end).toISOString());

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const result = (generated ?? []).map((entry: any) => ({
      id: entry.id,
      date: entry.date,
      userId: entry.userId,
      userName: entry.user?.name ?? 'Unknown',
      userRole: entry.user?.role ?? 'Unknown',
      shiftName: entry.shiftName,
      startTime: entry.startTime,
      endTime: entry.endTime,
    }));

    return NextResponse.json({ entries: result, count: result.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
