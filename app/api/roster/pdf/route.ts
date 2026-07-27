import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { generateRosterPdf } from '@/lib/pdfGenerator';
import { format, parseISO, startOfDay, endOfDay } from 'date-fns';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { departmentId, startDate, endDate, inchargeName } = body;

    if (!departmentId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'departmentId, startDate, and endDate are required' },
        { status: 400 }
      );
    }

    // Fetch department info
    const { data: dept, error: deptError } = await supabase
      .from('Department')
      .select('id, name, hospitalName')
      .eq('id', departmentId)
      .single();

    if (deptError || !dept) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    // Fetch shift templates for this department
    const { data: shiftTemplates, error: shiftError } = await supabase
      .from('ShiftTemplate')
      .select('id, name, durationHours, departmentId')
      .eq('departmentId', departmentId)
      .order('name', { ascending: true });

    if (shiftError) {
      return NextResponse.json({ error: shiftError.message }, { status: 500 });
    }

    // Fetch roster entries for the date range
    const rangeStart = startOfDay(parseISO(startDate)).toISOString();
    const rangeEnd = endOfDay(parseISO(endDate)).toISOString();

    const { data: entries, error: entryError } = await supabase
      .from('RosterEntry')
      .select('id, date, userId, shiftName, startTime, endTime, user:User(name, role)')
      .gte('date', rangeStart)
      .lte('date', rangeEnd);

    if (entryError) {
      return NextResponse.json({ error: entryError.message }, { status: 500 });
    }

    // Filter entries by department users
    const { data: deptUsers } = await supabase
      .from('User')
      .select('id')
      .eq('departmentId', departmentId);

    const deptUserIds = new Set((deptUsers ?? []).map((u: any) => u.id));

    const filteredEntries = ((entries ?? []) as any[])
      .filter((e: any) => deptUserIds.has(e.userId))
      .map((e: any) => ({
        id: e.id,
        date: e.date,
        userId: e.userId,
        userName: e.user?.name ?? 'Unknown',
        shiftName: e.shiftName,
      }));

    // Generate PDF
    const pdfBuffer = generateRosterPdf({
      departmentName: dept.name,
      hospitalName: dept.hospitalName,
      startDate,
      endDate,
      inchargeName: inchargeName || '',
      entries: filteredEntries,
      shiftTemplates: (shiftTemplates ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        durationHours: s.durationHours,
      })),
    });

    // Format filename
    const monthStr = format(parseISO(startDate), 'MMMM-yyyy');
    const safeDept = dept.name.replace(/[^a-zA-Z0-9]/g, '-');
    const filename = `roster-${safeDept}-${monthStr}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
      },
    });
  } catch (err: any) {
    console.error('PDF generation error:', err);
    return NextResponse.json({ error: 'Failed to generate PDF: ' + err.message }, { status: 500 });
  }
}
