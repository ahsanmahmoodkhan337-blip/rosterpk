import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/swaps/outgoing?userId=X
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId query param is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('SwapRequest')
    .select(`
      id,
      requesterId,
      recipientId,
      rosterEntryId,
      status,
      createdAt,
      updatedAt,
      recipient:recipientId(name, role, rank),
      rosterEntry:rosterEntryId(date, shiftName, startTime, endTime)
    `)
    .eq('requesterId', userId)
    .order('createdAt', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Flatten nested relations
  const swaps = (data ?? []).map((s: any) => ({
    id: s.id,
    requesterId: s.requesterId,
    recipientId: s.recipientId,
    rosterEntryId: s.rosterEntryId,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    recipientName: s.recipient?.name ?? 'Unknown',
    recipientRole: s.recipient?.role ?? 'Unknown',
    recipientRank: s.recipient?.rank ?? null,
    shiftDate: s.rosterEntry?.date ?? null,
    shiftName: s.rosterEntry?.shiftName ?? 'Unknown',
    shiftStartTime: s.rosterEntry?.startTime ?? null,
    shiftEndTime: s.rosterEntry?.endTime ?? null,
  }));

  return NextResponse.json(swaps);
}
