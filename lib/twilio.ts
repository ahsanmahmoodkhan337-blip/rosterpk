import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

let client: twilio.Twilio | null = null;

function getClient(): twilio.Twilio | null {
  if (!accountSid || !authToken) {
    return null;
  }
  if (!client) {
    client = twilio(accountSid, authToken);
  }
  return client;
}

/**
 * Send a WhatsApp notification message.
 * Gracefully degrades if Twilio credentials are not configured.
 */
export async function sendWhatsAppNotification(
  toPhone: string,
  message: string
): Promise<boolean> {
  const twilioClient = getClient();
  if (!twilioClient) {
    console.log('[Twilio] No credentials configured — skipping WhatsApp notification');
    return false;
  }

  try {
    // Format phone number for WhatsApp
    const to = toPhone.startsWith('whatsapp:') ? toPhone : `whatsapp:${toPhone}`;

    await twilioClient.messages.create({
      from: fromNumber,
      to,
      body: message,
    });

    console.log(`[Twilio] WhatsApp sent to ${toPhone}`);
    return true;
  } catch (err: any) {
    console.error('[Twilio] Failed to send WhatsApp:', err.message);
    return false;
  }
}

/**
 * Notify a user about a swap request.
 */
export async function notifySwapRequest(
  recipientPhone: string,
  requesterName: string,
  shiftName: string,
  swapId: string
): Promise<boolean> {
  return sendWhatsAppNotification(
    recipientPhone,
    `🔁 *Swap Request from ${requesterName}*\n\n` +
    `${requesterName} wants to swap their *${shiftName}* shift with you.\n\n` +
    `Open RosterDoc to accept or decline: /swaps\n` +
    `Swap ID: ${swapId}`
  );
}

/**
 * Notify a user about swap status change.
 */
export async function notifySwapStatus(
  recipientPhone: string,
  status: 'ACCEPTED' | 'DECLINED' | 'APPROVED' | 'REJECTED',
  otherPartyName: string,
  shiftName: string
): Promise<boolean> {
  const statusMessages: Record<string, { emoji: string; text: string }> = {
    ACCEPTED: { emoji: '✅', text: 'accepted' },
    DECLINED: { emoji: '❌', text: 'declined' },
    APPROVED: { emoji: '✅', text: 'approved by admin' },
    REJECTED: { emoji: '❌', text: 'rejected by admin' },
  };

  const info = statusMessages[status] || { emoji: '📋', text: 'updated' };

  return sendWhatsAppNotification(
    recipientPhone,
    `${info.emoji} *Swap ${info.text}*\n\n` +
    `Your swap for *${shiftName}* with ${otherPartyName} has been ${info.text}.\n\n` +
    `Open RosterDoc to view details: /swaps`
  );
}
