import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { notifySwapStatus } from '@/lib/twilio';

// PATCH /api/swaps/[id] — accept/decline/approve/reject
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    if (!action || !['accept', 'decline', 'approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be one of: accept, decline, approve, reject' },
        { status: 400 }
      );
    }

    // Fetch the swap request with related data
    const { data: swap, error: swapErr } = await supabase
      .from('SwapRequest')
      .select('*, requester:requesterId(id, name, phone), recipient:recipientId(id, name, phone), rosterEntry:rosterEntryId(shiftName)')
      .eq('id', id)
      .single();

    if (swapErr || !swap) {
      return NextResponse.json({ error: 'Swap request not found' }, { status: 404 });
    }

    const requester = (swap as any).requester;
    const recipient = (swap as any).recipient;
    const shiftName = (swap as any).rosterEntry?.shiftName ?? 'a shift';

    let newStatus: string;

    switch (action) {
      case 'accept':
        if (swap.status !== 'PENDING_PEER') {
          return NextResponse.json(
            { error: 'Swap is not in PENDING_PEER status' },
            { status: 400 }
          );
        }
        newStatus = 'PENDING_ADMIN';
        break;

      case 'decline':
        if (swap.status !== 'PENDING_PEER') {
          return NextResponse.json(
            { error: 'Swap is not in PENDING_PEER status' },
            { status: 400 }
          );
        }
        newStatus = 'REJECTED';
        break;

      case 'approve':
        if (swap.status !== 'PENDING_ADMIN') {
          return NextResponse.json(
            { error: 'Swap is not in PENDING_ADMIN status' },
            { status: 400 }
          );
        }
        // Swap the shift: reassign the roster entry from requester to recipient
        const { error: updateErr } = await supabase
          .from('RosterEntry')
          .update({
            userId: swap.recipientId,
            status: 'SWAPPED',
          })
          .eq('id', swap.rosterEntryId);

        if (updateErr) {
          return NextResponse.json(
            { error: 'Failed to swap shifts: ' + updateErr.message },
            { status: 500 }
          );
        }
        newStatus = 'APPROVED';
        break;

      case 'reject':
        if (swap.status !== 'PENDING_ADMIN') {
          return NextResponse.json(
            { error: 'Swap is not in PENDING_ADMIN status' },
            { status: 400 }
          );
        }
        newStatus = 'REJECTED';
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Update swap status
    const { data: updated, error: updateStatusErr } = await supabase
      .from('SwapRequest')
      .update({ status: newStatus })
      .eq('id', id)
      .select()
      .single();

    if (updateStatusErr) {
      return NextResponse.json({ error: updateStatusErr.message }, { status: 500 });
    }

    // Send WhatsApp notification (non-blocking)
    const notifyPhone = action === 'accept' || action === 'decline'
      ? requester?.phone  // notify requester about recipient's response
      : recipient?.phone;  // notify recipient about admin's decision

    const otherParty = action === 'accept' || action === 'decline'
      ? recipient?.name || 'Recipient'
      : 'Admin';

    if (notifyPhone) {
      const statusMap: Record<string, 'ACCEPTED' | 'DECLINED' | 'APPROVED' | 'REJECTED'> = {
        accept: 'ACCEPTED',
        decline: 'DECLINED',
        approve: 'APPROVED',
        reject: 'REJECTED',
      };
      notifySwapStatus(notifyPhone, statusMap[action], otherParty, shiftName).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('Swap update error:', err);
    return NextResponse.json(
      { error: 'Failed to update swap request' },
      { status: 500 }
    );
  }
}
