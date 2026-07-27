import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

  // 2. Parse "APPROVE [ID]" or "DECLINE [ID]"
  const [command, swapId] = incomingMsg.split(' ');

  if (!swapId) {
    return new NextResponse(
      '<Response><Message>Format: APPROVE [ID] or DECLINE [ID]</Message></Response>',
      {
        headers: { 'Content-Type': 'text/xml' },
      }
    );
  }

  try {
    if (command === 'approve') {
      // Look up the roster entry by id
      const { data: entry, error: entryErr } = await supabase
        .from('RosterEntry')
        .select('*')
        .eq('id', swapId)
        .single();

      if (entryErr || !entry) {
        return new NextResponse('<Response><Message>❌ Swap not found.</Message></Response>', {
          headers: { 'Content-Type': 'text/xml' },
        });
      }
      // For a real swap, we'd look up a SwapRequest and update both entries.
      // For now, we acknowledge the approval and mark the entry.
      const { error: updateErr } = await supabase
        .from('RosterEntry')
        .update({ isCompleted: true })
        .eq('id', swapId);

      if (updateErr) throw updateErr;

      return new NextResponse(
        '<Response><Message>✅ Swap Approved. Roster Updated.</Message></Response>',
        {
          headers: { 'Content-Type': 'text/xml' },
        }
      );
    }

    if (command === 'decline') {
      return new NextResponse('<Response><Message>❌ Swap Declined.</Message></Response>', {
        headers: { 'Content-Type': 'text/xml' },
      });
    }

    return new NextResponse(
      '<Response><Message>Unknown command. Use APPROVE [ID] or DECLINE [ID].</Message></Response>',
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
