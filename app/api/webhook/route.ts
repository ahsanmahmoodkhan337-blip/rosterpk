import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { notifySwapStatus } from '@/lib/twilio';

export async function POST(req: Request) {
  const body = await req.text();
  const params = new URLSearchParams(body);

  const incomingMsg = params.get('Body')?.trim().toLowerCase() || '';
  const senderPhone = params.get('From')?.replace('whatsapp:', '') || '';

  // 1. Verify Admin Status
  const { data: admin, error: adminErr } = await supabase
    .from('User')
    .select('*')
    .eq('phone', senderPhone)
    .single();

  if (adminErr || !admin || admin.role !== 'ADMIN') {
    return new NextResponse('<Response><Message>Unauthorized</Message></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }

  // 2. Parse "APPROVE [ID]" or "DECLINE [ID]" or "REJECT [ID]"
  const [command, swapId] = incomingMsg.split(' ');

  if (!swapId) {
    return new NextResponse(
      '<Response><Message>Format: APPROVE [swap_id] or REJECT [swap_id]</Message></Response>',
      {
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  }

  try {
    if (command === 'approve') {
      // Look up the swap request with related user data
      const { data: swap, error: swapErr } = await supabase
        .from('SwapRequest')
        .select('*, requester:requesterId(id, name, phone), recipient:recipientId(id, name, phone), rosterEntry:rosterEntryId(shiftName)')
        .eq('id', swapId)
        .single();

      if (swapErr || !swap) {
        return new NextResponse('<Response><Message>❌ Swap request not found.</Message></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }

      if (swap.status !== 'PENDING_ADMIN') {
        return new NextResponse('<Response><Message>❌ Swap is not pending admin approval.</Message></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }

      // Reassign the roster entry to the recipient
      const { error: updateEntryErr } = await supabase
        .from('RosterEntry')
        .update({
          userId: swap.recipientId,
          status: 'SWAPPED',
        })
        .eq('id', swap.rosterEntryId);

      if (updateEntryErr) {
        return new NextResponse('<Response><Message>❌ Failed to update roster.</Message></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }

      // Mark swap as approved
      await supabase
        .from('SwapRequest')
        .update({ status: 'APPROVED' })
        .eq('id', swapId);

      // Notify recipient via WhatsApp
      const recipient = (swap as any).recipient;
      const shiftName = (swap as any).rosterEntry?.shiftName ?? 'a shift';
      if (recipient?.phone) {
        notifySwapStatus(recipient.phone, 'APPROVED', 'Admin', shiftName).catch(() => {});
      }

      return new NextResponse(
        '<Response><Message>✅ Swap Approved. Shift reassigned. Roster updated.</Message></Response>',
        {
          headers: { 'Content-Type': 'text/xml' },
        }
      );
    }

    if (command === 'decline' || command === 'reject') {
      const { data: swap, error: swapErr } = await supabase
        .from('SwapRequest')
        .select('*, requester:requesterId(id, name, phone), recipient:recipientId(id, name, phone), rosterEntry:rosterEntryId(shiftName)')
        .eq('id', swapId)
        .single();

      if (swapErr || !swap) {
        return new NextResponse('<Response><Message>❌ Swap request not found.</Message></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }

      await supabase
        .from('SwapRequest')
        .update({ status: 'REJECTED' })
        .eq('id', swapId);

      // Notify requester via WhatsApp
      const requester = (swap as any).requester;
      const shiftName = (swap as any).rosterEntry?.shiftName ?? 'a shift';
      if (requester?.phone) {
        notifySwapStatus(requester.phone, 'REJECTED', 'Admin', shiftName).catch(() => {});
      }

      return new NextResponse('<Response><Message>❌ Swap Rejected.</Message></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    return new NextResponse(
      '<Response><Message>Unknown command. Use APPROVE [swap_id] or REJECT [swap_id].</Message></Response>',
      {
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new NextResponse('<Response><Message>System Error.</Message></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
