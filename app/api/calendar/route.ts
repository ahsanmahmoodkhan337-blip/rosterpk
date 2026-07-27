import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const TZID = 'Asia/Karachi';
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // UTC+5

// Format a date as ICS local datetime: YYYYMMDDTHHMMSS
function toIcsDateTime(isoStr: string): string {
  try {
    const date = new Date(isoStr);
    // Convert to Asia/Karachi (UTC+5, no DST)
    const local = new Date(date.getTime() + PKT_OFFSET_MS);
    const y = local.getUTCFullYear();
    const m = String(local.getUTCMonth() + 1).padStart(2, '0');
    const d = String(local.getUTCDate()).padStart(2, '0');
    const hh = String(local.getUTCHours()).padStart(2, '0');
    const mm = String(local.getUTCMinutes()).padStart(2, '0');
    const ss = String(local.getUTCSeconds()).padStart(2, '0');
    return `${y}${m}${d}T${hh}${mm}${ss}`;
  } catch {
    // Fallback: strip non-digit chars and format
    const d = isoStr.replace(/[-:]/g, '').replace(/\.\d+Z?$/, '').replace('Z', '');
    return d.slice(0, 15);
  }
}

// Escape ICS text fields
function escapeIcsText(text: string): string {
  return (text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// Generate a single VEVENT for a roster entry
function generateVEvent(
  entry: any,
  userName?: string,
): string {
  const uid = `shift-${entry.id}@rosterdoc`;
  const dtStart = toIcsDateTime(entry.startTime);
  const dtEnd = toIcsDateTime(entry.endTime);
  const now = toIcsDateTime(new Date().toISOString());

  const summaryPrefix = userName ? `${userName} — ` : '';
  const summary = escapeIcsText(`${summaryPrefix}${entry.shiftName}`);

  const descriptionParts = [`Shift Type: ${entry.shiftName}`];
  if (entry.departmentName) {
    descriptionParts.push(`Department: ${entry.departmentName}`);
  }
  if (entry.hospitalName) {
    descriptionParts.push(`Hospital: ${entry.hospitalName}`);
  }
  if (entry.userRole) {
    descriptionParts.push(`Role: ${entry.userRole}`);
  }
  if (entry.notes) {
    descriptionParts.push(`Notes: ${entry.notes}`);
  }
  const description = escapeIcsText(descriptionParts.join('\\n'));

  const location = escapeIcsText(entry.departmentName || entry.hospitalName || 'RosterDoc');

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${TZID}:${dtStart}`,
    `DTEND;TZID=${TZID}:${dtEnd}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'END:VEVENT',
  ].join('\r\n');
}

// Build the full ICS calendar
function buildIcsCalendar(events: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RosterDoc//Hospital Scheduling//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:RosterDoc Schedule',
    'X-WR-TIMEZONE:Asia/Karachi',
    // VTIMEZONE for Asia/Karachi (UTC+5, no DST)
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Karachi',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0500',
    'TZOFFSETTO:+0500',
    'TZNAME:PKT',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const departmentId = searchParams.get('departmentId');

  if (!userId && !departmentId) {
    return NextResponse.json(
      { error: 'Either userId or departmentId query param is required' },
      { status: 400 },
    );
  }

  try {
    const events: string[] = [];

    if (userId) {
      // Single user export
      // Fetch user info
      const { data: userData, error: userError } = await supabase
        .from('User')
        .select('id, name, role, department:Department(id, name, hospitalName)')
        .eq('id', userId)
        .single();

      if (userError || !userData) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const user = userData as any;
      const dept = user.department;

      // Fetch roster entries for this user
      const { data: entries, error: entriesError } = await supabase
        .from('RosterEntry')
        .select('*')
        .eq('userId', userId)
        .order('startTime', { ascending: true });

      if (entriesError) {
        return NextResponse.json({ error: entriesError.message }, { status: 500 });
      }

      for (const entry of (entries ?? [])) {
        events.push(
          generateVEvent({
            ...entry,
            departmentName: dept?.name,
            hospitalName: dept?.hospitalName,
            userRole: user.role,
          }),
        );
      }
    } else if (departmentId) {
      // Department-wide export
      // Fetch department info
      const { data: deptData, error: deptError } = await supabase
        .from('Department')
        .select('id, name, hospitalName')
        .eq('id', departmentId)
        .single();

      if (deptError || !deptData) {
        return NextResponse.json({ error: 'Department not found' }, { status: 404 });
      }

      const dept = deptData as any;

      // Fetch all users in department
      const { data: users } = await supabase
        .from('User')
        .select('id, name, role')
        .eq('departmentId', departmentId);

      if (!users || users.length === 0) {
        return NextResponse.json({ error: 'No users found in this department' }, { status: 404 });
      }

      const userIds = users.map((u: any) => u.id);
      const userMap = new Map(users.map((u: any) => [u.id, u]));

      // Fetch all roster entries for these users
      const { data: entries, error: entriesError } = await supabase
        .from('RosterEntry')
        .select('*')
        .in('userId', userIds)
        .gte('startTime', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // last 30 days onward
        .order('startTime', { ascending: true });

      if (entriesError) {
        return NextResponse.json({ error: entriesError.message }, { status: 500 });
      }

      for (const entry of (entries ?? [])) {
        const user = userMap.get(entry.userId) as any;
        const userName = user?.name || `User ${entry.userId}`;
        events.push(
          generateVEvent(
            {
              ...entry,
              departmentName: dept.name,
              hospitalName: dept.hospitalName,
              userRole: user?.role,
            },
            `Dr. ${userName}`,
          ),
        );
      }
    }

    const icsContent = buildIcsCalendar(events);

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="rosterdoc-schedule.ics"`,
      },
    });
  } catch (err: any) {
    console.error('Calendar generation error:', err);
    return NextResponse.json(
      { error: 'Internal server error generating calendar' },
      { status: 500 },
    );
  }
}
