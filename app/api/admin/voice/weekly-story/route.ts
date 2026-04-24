import { NextRequest, NextResponse } from 'next/server';
import axios                         from 'axios';
import mongoose                      from 'mongoose';
import connectToDatabase             from '@/lib/mongodb';
import User                          from '@/models/User';
import { buildWeeklyStory }          from '@/lib/voice/buildWeeklyStory';
import { EmailService }              from '@/lib/email';

const VAPI_BASE = 'https://api.vapi.ai';

/**
 * POST /api/admin/voice/weekly-story
 *
 * Generates and delivers the weekly story to a client via:
 *   1. Vapi outbound voice call (voice script)
 *   2. Resend email (premium summary)
 *
 * Body: { tenantId }
 * Can be triggered from a cron, War Room button, or autonomous cycle.
 */
export async function POST(req: NextRequest) {
  try {
    const { tenantId } = await req.json();
    if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

    const { VAPI_API_KEY, VAPI_DEFAULT_PHONE_NUMBER_ID, NEXTAUTH_URL } = process.env;

    await connectToDatabase();
    const tenant = await User.findById(tenantId)
      .select('name onboardingConfig targetDomain clientVoice')
      .lean() as any;

    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    const clientPhone    = tenant?.onboardingConfig?.clientPhone;
    const clientEmail    = tenant?.onboardingConfig?.clientReportingEmail;
    const targetDomain   = tenant?.targetDomain ?? tenant?.onboardingConfig?.targetDomain ?? '';
    const brandType      = tenant?.clientVoice?.brandVoiceProfile?.type ?? 'professional';
    const momentumState  = tenant?.clientVoice?.momentum?.state ?? 'early';
    const agentName      = tenant?.clientVoice?.agentName ?? 'Your Business Assistant';

    /* ── Build the story ─────────────────────────────────────────── */
    const story = await buildWeeklyStory({
      tenantId,
      tenantName:   tenant.name ?? 'Client',
      targetDomain,
      brandType,
      momentumState,
    });

    const results: Record<string, any> = { stats: story.stats };

    /* ── 1. Send email ───────────────────────────────────────────── */
    if (clientEmail) {
      try {
        const emailSvc = new EmailService();
        await (emailSvc as any).resend.emails.send({
          from:    process.env.RESEND_FROM_EMAIL || 'Your Growth Team <nova@aipilots.site>',
          to:      clientEmail,
          subject: story.emailSubject,
          html:    story.emailHtml,
        });
        results.emailSent = true;
      } catch (emailErr: any) {
        console.warn('[WEEKLY STORY] Email failed (non-fatal):', emailErr.message);
        results.emailError = emailErr.message;
      }
    }

    /* ── 2. Vapi voice call ──────────────────────────────────────── */
    if (clientPhone && VAPI_API_KEY) {
      try {
        const systemPrompt = `
You are ${agentName}, delivering a brief weekly progress update.
Deliver this message naturally and warmly:
"${story.voiceScript}"
Then say "That's your weekly update — have a great week!" and end the call.
Do not add, change, or ask anything else.
`.trim();

        const vapiRes = await axios.post(`${VAPI_BASE}/call`, {
          name:          `Weekly Story — ${targetDomain}`,
          type:          'outboundPhoneCall',
          phoneNumberId: VAPI_DEFAULT_PHONE_NUMBER_ID,
          customer:      { number: clientPhone },
          assistant: {
            name:  agentName,
            voice: { provider: 'openai', voiceId: 'nova' },
            model: {
              provider: 'openai',
              model:    'gpt-4o-mini',
              messages: [{ role: 'system', content: systemPrompt }],
            },
            firstMessage:           story.voiceScript,
            firstMessageMode:       'assistant-speaks-first',
            endCallMessage:         "That's your weekly update — have a great week!",
            endCallFunctionEnabled: true,
            maxDurationSeconds:     90,
            recordingEnabled:       true,
            metadata: { tenantId, callType: 'weekly_story' },
          },
        }, {
          headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' },
        });

        results.callId = vapiRes.data?.id;
        results.callPlaced = true;
      } catch (callErr: any) {
        console.warn('[WEEKLY STORY] Call failed (non-fatal):', callErr.message);
        results.callError = callErr.message;
      }
    }

    /* ── 3. Update weekly story memory ───────────────────────────── */
    await User.findByIdAndUpdate(tenantId, {
      $set: {
        'clientVoice.weeklyStory.lastSentAt':  new Date(),
        'clientVoice.weeklyStory.lastSummary': story.voiceScript.slice(0, 300),
      },
    });

    /* ── 4. Log ──────────────────────────────────────────────────── */
    const db = mongoose.connection.db!;
    await db.collection('activityLogs').insertOne({
      userId:    tenantId,
      type:      'WEEKLY_STORY_SENT',
      message:   `📰 Weekly story sent → ${targetDomain} (${story.stats.pagesThisWeek} pages this week)`,
      level:     'success',
      metadata:  { ...results, voiceScript: story.voiceScript },
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    console.error('[WEEKLY STORY]', err?.message);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
