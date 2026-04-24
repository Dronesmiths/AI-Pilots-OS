import twilio from 'twilio';

const APP_URL = process.env.NEXTAUTH_URL ??
                process.env.APP_URL      ??
                'https://crm.aipilots.site';

/**
 * triggerNovaCall
 * ───────────────
 * Places an outbound Twilio call to the operator.
 * Nova introduces itself, explains what it just did,
 * and presents a DTMF choice to trigger more actions.
 *
 * Called from the SEO action pipeline — non-fatal.
 */
export type NovaCallParams = {
  to:          string;   // operator phone number (+1...)
  keyword:     string;
  actionType:  string;
  tenantId:    string;
  summaryId?:  string;   // used to optionally play the TTS clip
  clientName?: string;
};

export async function triggerNovaCall(params: NovaCallParams): Promise<string | null> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.warn('[NOVA CALL] Missing Twilio credentials — skipping outbound call.');
    return null;
  }

  if (!params.to) {
    console.warn('[NOVA CALL] No operator phone number on tenant — skipping.');
    return null;
  }

  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  const scriptUrl = `${APP_URL}/api/voice/nova-call/script?` +
    `keyword=${encodeURIComponent(params.keyword)}` +
    `&tenantId=${encodeURIComponent(params.tenantId)}` +
    `&actionType=${encodeURIComponent(params.actionType)}` +
    (params.summaryId ? `&summaryId=${params.summaryId}` : '');

  try {
    const call = await client.calls.create({
      to:       params.to,
      from:     TWILIO_PHONE_NUMBER,
      url:      scriptUrl,
      method:   'GET',
      // Limit call attempt to 30s ring — don't keep ringing all day
      machineDetection: 'Enable',
      asyncAmd: 'true',
      asyncAmdStatusCallback: `${APP_URL}/api/voice/nova-call/amd`,
    });

    console.log(`[NOVA CALL] Outbound call placed to ${params.to} — SID: ${call.sid}`);
    return call.sid;
  } catch (err: any) {
    console.error('[NOVA CALL] Twilio call failed:', err?.message);
    return null;
  }
}
