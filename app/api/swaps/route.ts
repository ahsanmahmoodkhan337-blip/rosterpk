import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { notifySwapRequest } from '@/lib/twilio';

// POST /api/swaps — create a swap request
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { requesterId, recipientId, rosterEntryId, reason } = body;

    if (!requesterId || !recipientId || !rosterEntryId) {
      return NextResponse.json(
        { error: 'requesterId, recipientId, and rosterEntryId are required' },
        { status: 400 }
      );
    }

    // Verify the roster entry belongs to the requester
    const { data: entry, error: entryErr } = await supabase
      .from('RosterEntry')
      .select('*')
      .eq('id', rosterEntryId)
      .eq('userId', requesterId)
      .single();

    if (entryErr || !entry) {
      return NextResponse.json(
        { error: 'Shift not found or does not belong to requester' },
        { status: 404 }
      );
    }

    // Verify recipient exists and is in the same department
    const { data: requester, error: reqErr } = await supabase
      .from('User')
      .select('departmentId, name')
      .eq('id', requesterId)
      .single();

    const { data: recipient, error: recErr } = await supabase
      .from('User')
      .select('departmentId, name, phone')
      .eq('id', recipientId)
      .single();

    if (reqErr || recErr || requester.departmentId !== recipient.departmentId) {
      return NextResponse.json(
        { error: 'Recipient not found or not in the same department' },
        { status: 400 }
      );
    }

    // Create swap request
    const { data: swap, error: insertErr } = await supabase
      .from('SwapRequest')
      .insert({
        requesterId,
        recipientId,
        rosterEntryId,
        status: 'PENDING_PEER',
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Try to store reason if it was provided (column may not exist yet)
    if (reason) {
      try {
        await supabase
          .from('SwapRequest')
          .update({ reason } as any)
          .eq('id', swap.id);
      } catch {
        // reason column doesn't exist yet, silently ignore
      }
    }

    // Send WhatsApp notification to recipient (non-blocking)
    if (recipient.phone) {
      notifySwapRequest(
        recipient.phone,
        requester.name || 'A colleague',
        entry.shiftName,
        swap.id
      ).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json(swap, { status: 201 });
  } catch (err: any) {
    console.error('Swap creation error:', err);
    return NextResponse.json(
      { error: 'Failed to create swap request' },
      { status: 500 }
    );
  }
}
