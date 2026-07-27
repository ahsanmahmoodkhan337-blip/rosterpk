import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/swaps/pending-admin?departmentId=X
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const departmentId = searchParams.get('departmentId');

  if (!departmentId) {
    return NextResponse.json({ error: 'departmentId query param is required' }, { status: 400 });
  }

  // Get all users in department
  const { data: deptUsers, error: deptErr } = await supabase
    .from('User')
    .select('id')
    .eq('departmentId', departmentId);

  if (deptErr) {
    return NextResponse.json({ error: deptErr.message }, { status: 500 });
  }

  const deptUserIds = (deptUsers ?? []).map((u: any) => u.id);

  if (deptUserIds.length === 0) {
    return NextResponse.json([]);
  }

  // Get pending admin swaps where either requester or recipient is in the department
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
      requester:requesterId(name, role, rank),
      recipient:recipientId(name, role, rank),
      rosterEntry:rosterEntryId(date, shiftName, startTime, endTime)
    `)
    .eq('status', 'PENDING_ADMIN')
    .in('requesterId', deptUserIds)
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
    requesterName: s.requester?.name ?? 'Unknown',
    requesterRole: s.requester?.role ?? 'Unknown',
    requesterRank: s.requester?.rank ?? null,
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
