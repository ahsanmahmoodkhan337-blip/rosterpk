import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateDraftRoster, detectConflicts, RosterDraftEntry } from '@/lib/scheduler';
import { parseISO, addDays, startOfDay, endOfDay } from 'date-fns';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { departmentId, startDate, days } = body;

  if (!departmentId || !startDate || !days) {
    return NextResponse.json(
      { error: 'Missing required fields: departmentId, startDate, days' },
      { status: 400 },
    );
  }

  const start = parseISO(startDate);
  const end = addDays(start, days);

  // Clear existing entries for this department and date range before generating
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

    // Fetch the generated entries with user info from DB
    const { data: generated, error: fetchErr } = await supabase
      .from('RosterEntry')
      .select('id, date, userId, shiftName, startTime, endTime, user:User(name, role, rank)')
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
      userRank: entry.user?.rank ?? null,
      shiftName: entry.shiftName,
      startTime: entry.startTime,
      endTime: entry.endTime,
    }));

    // Build conflict detection inputs
    const draftEntriesForConflicts: RosterDraftEntry[] = result.map((e: any) => ({
      date: new Date(e.date),
      userId: e.userId,
      shiftName: e.shiftName,
      shiftType: inferShiftType(e.shiftName),
      startTime: new Date(e.startTime),
      endTime: new Date(e.endTime),
    }));

    // Fetch all users with rank info for conflict detection
    const { data: allDeptUsers } = await supabase
      .from('User')
      .select('id, name, phone, role, rank, maxHoursLimit, departmentId')
      .eq('departmentId', departmentId);

    // Fetch shift templates for understaffing checks
    const { data: templates } = await supabase
      .from('ShiftTemplate')
      .select('*')
      .eq('departmentId', departmentId);

    const conflicts = detectConflicts(
      draftEntriesForConflicts,
      (allDeptUsers ?? []) as any[],
      (templates ?? []) as any[],
    );

    return NextResponse.json({
      entries: result,
      count: result.length,
      conflicts: conflicts.map((c) => ({
        type: c.type,
        message: c.message,
        severity: c.severity,
        entryIds: c.entries.map((e) => {
          // Match back to DB IDs
          const match = result.find(
            (r: any) => r.userId === e.userId && r.shiftName === e.shiftName &&
              Math.abs(new Date(r.startTime).getTime() - e.startTime.getTime()) < 60000,
          );
          return match?.id ?? null;
        }).filter(Boolean),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Crude shift type inference from name for backward compat */
function inferShiftType(name: string): 'MORNING' | 'EVENING' | 'NIGHT' | 'CALL_30HR' | null {
  const n = name.toUpperCase();
  if (n.includes('30') || n.includes('CALL_30')) return 'CALL_30HR';
  if (n.includes('NIGHT')) return 'NIGHT';
  if (n.includes('EVENING')) return 'EVENING';
  if (n.includes('MORNING')) return 'MORNING';
  return null;
}
