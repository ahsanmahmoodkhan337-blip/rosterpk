import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/notifications?userId=X&since=ISO_DATE
// Returns recent activity that should generate notifications for the user
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  const since = searchParams.get('since') || new Date(Date.now() - 5 * 60 * 1000).toISOString(); // default last 5 min

  if (!userId) {
    return NextResponse.json({ error: 'userId query param is required' }, { status: 400 });
  }

  try {
    const items: Array<{
      id: string;
      type: string;
      title: string;
      message: string;
      createdAt: string;
      link?: string;
      metadata?: Record<string, any>;
    }> = [];

    // 1. Check for new incoming swap requests (PENDING_PEER where user is recipient)
    const { data: incomingSwaps } = await supabase
      .from('SwapRequest')
      .select('id, requesterId, rosterEntryId, createdAt, requester:requesterId(name, role), rosterEntry:rosterEntryId(shiftName, startTime)')
      .eq('recipientId', userId)
      .eq('status', 'PENDING_PEER')
      .gte('createdAt', since)
      .order('createdAt', { ascending: false });

    for (const swap of (incomingSwaps ?? [])) {
      const requesterName = (swap as any).requester?.name ?? 'A colleague';
      const shiftName = (swap as any).rosterEntry?.shiftName ?? 'a shift';
      items.push({
        id: `inc_${swap.id}`,
        type: 'SWAP_REQUEST',
        title: 'New Swap Request',
        message: `${requesterName} wants to swap their ${shiftName} shift with you.`,
        createdAt: swap.createdAt,
        link: '/swaps',
        metadata: { swapId: swap.id },
      });
    }

    // 2. Check for outgoing swap status changes (accepted/declined)
    const { data: outgoingSwaps } = await supabase
      .from('SwapRequest')
      .select('id, recipientId, status, updatedAt, createdAt, recipient:recipientId(name), rosterEntry:rosterEntryId(shiftName)')
      .eq('requesterId', userId)
      .in('status', ['PENDING_ADMIN', 'APPROVED', 'REJECTED'])
      .gte('updatedAt', since)
      .order('updatedAt', { ascending: false });

    for (const swap of (outgoingSwaps ?? [])) {
      const recipientName = (swap as any).recipient?.name ?? 'Your colleague';
      const shiftName = (swap as any).rosterEntry?.shiftName ?? 'a shift';
      
      if (swap.status === 'PENDING_ADMIN') {
        // Only show if it just changed to PENDING_ADMIN (from PENDING_PEER)
        if (swap.updatedAt !== swap.createdAt) {
          items.push({
            id: `out_acc_${swap.id}`,
            type: 'SWAP_ACCEPTED',
            title: 'Swap Accepted',
            message: `${recipientName} accepted your swap request for ${shiftName}. Awaiting admin approval.`,
            createdAt: swap.updatedAt,
            link: '/swaps',
            metadata: { swapId: swap.id },
          });
        }
      } else if (swap.status === 'APPROVED') {
        items.push({
          id: `out_appr_${swap.id}`,
          type: 'SWAP_APPROVED',
          title: 'Swap Approved',
          message: `Your swap request for ${shiftName} with ${recipientName} has been approved!`,
          createdAt: swap.updatedAt,
          link: '/swaps',
          metadata: { swapId: swap.id },
        });
      } else if (swap.status === 'REJECTED') {
        items.push({
          id: `out_rej_${swap.id}`,
          type: 'SWAP_REJECTED',
          title: 'Swap Declined',
          message: `Your swap request for ${shiftName} with ${recipientName} was declined.`,
          createdAt: swap.updatedAt,
          link: '/swaps',
          metadata: { swapId: swap.id },
        });
      }
    }

    // 3. Check for recently published roster entries (within the user's department)
    const { data: userData } = await supabase
      .from('User')
      .select('departmentId')
      .eq('id', userId)
      .single();

    if (userData) {
      const { data: newEntries } = await supabase
        .from('RosterEntry')
        .select('id, shiftName, date, startTime')
        .eq('userId', userId)
        .gte('date', since)
        .order('date', { ascending: false })
        .limit(5);

      // Only notify if entries were created recently (not existing ones)
      for (const entry of (newEntries ?? [])) {
        // Check if this entry is very new (created within the window, not just scheduled)
        const entryDate = new Date(entry.date);
        if (entryDate.getTime() > Date.now() - 10 * 60 * 1000) {
          // This is likely a recent assignment
          items.push({
            id: `roster_${entry.id}`,
            type: 'ROSTER_UPDATE',
            title: 'New Shift Assigned',
            message: `You've been assigned a ${entry.shiftName} shift on ${new Date(entry.date).toLocaleDateString()}.`,
            createdAt: entry.date,
            link: '/',
            metadata: { entryId: entry.id },
          });
        }
      }
    }

    return NextResponse.json(items);
  } catch (err: any) {
    console.error('Notifications error:', err);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}
