import { NextRequest, NextResponse } from 'next/server';
import axios                         from 'axios';
import mongoose                      from 'mongoose';
import connectToDatabase             from '@/lib/mongodb';
import User                          from '@/models/User';
import { buildMonthlyStrategy }      from '@/lib/strategy/buildMonthlyStrategy';
import { EmailService }              from '@/lib/email';

const VAPI_BASE = 'https://api.vapi.ai';

/**
 * POST /api/admin/voice/monthly-strategy
 *
 * Generates and delivers the monthly strategy report.
 * - Agent: detailed voice (interactive) + full email
 * - Client: simplified voice + simple email
 *
 * Body: { tenantId, force? }
 * `force: true` bypasses the 30-day dedup guard.
 */
export async function POST(req: NextRequest) {
  try {
    const { tenantId, force = false } = await req.json();
    if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });

    const { VAPI_API_KEY, VAPI_DEFAULT_PHONE_NUMBER_ID, NEXTAUTH_URL } = process.env;

    await connectToDatabase();
    const tenant = await User.findById(tenantId)
      .select('name onboardingConfig targetDomain clientVoice phone email')
      .lean() as any;
    if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

    // Dedup guard — skip if already sent this month
    const lastSent = tenant?.clientVoice?.strategyMemory?.lastSentAt;
    if (!force && lastSent) {
      const daysSince = (Date.now() - new Date(lastSent).getTime()) / 86_400_000;
      if (daysSince < 28) {
        return NextResponse.json({ skipped: true, reason: `Strategy report sent ${Math.floor(daysSince)} days ago` });
      }
    }

    const brandType    = tenant?.clientVoice?.brandVoiceProfile?.type ?? 'professional';
    const agentName    = tenant?.clientVoice?.agentName ?? 'Your Business Assistant';
    const targetDomain = tenant?.targetDomain ?? tenant?.onboardingConfig?.targetDomain ?? '';
    const agentPhone   = tenant?.phone;
    const clientPhone  = tenant?.onboardingConfig?.clientPhone;
    const agentEmail   = tenant?.email;
    const clientEmail  = tenant?.onboardingConfig?.clientReportingEmail;

    const strategy = await buildMonthlyStrategy({ tenantId, tenantName: tenant.name ?? '', targetDomain, brandType });

    const results: Record<string, any> = { pattern: strategy.pattern };

    /* ── Agent voice call (interactive) ─────────────────────────── */
    if (agentPhone && VAPI_API_KEY) {
      try {
        const agentScript = [
          `${tenant.name?.split(' ')[0] ?? 'Hey'} — monthly strategy update.`,
          strategy.agentNarrative,
          `Recommended next step: ${strategy.recommendedNextStep}.`,
          `Do you want to proceed, or take a different direction?`,
        ].join(' ');

        const agentRes = await axios.post(`${VAPI_BASE}/call`, {
          name:          `Monthly Strategy — ${targetDomain}`,
          type:          'outboundPhoneCall',
          phoneNumberId: VAPI_DEFAULT_PHONE_NUMBER_ID,
          customer:      { number: agentPhone },
          assistant: {
            name:  'Nova',
            voice: { provider: 'openai', voiceId: 'nova' },
            model: {
              provider: 'openai', model: 'gpt-4o-mini',
              messages: [{
                role: 'system',
                content: `You are Nova delivering a monthly strategy update. Deliver the update, present the recommendation, and ask for a yes/no decision. Log the decision. Keep the call under 90 seconds.`,
              }],
            },
            firstMessage:           agentScript,
            firstMessageMode:       'assistant-speaks-first',
            endCallFunctionEnabled: true,
            maxDurationSeconds:     120,
            recordingEnabled:       true,
            serverUrl: `${NEXTAUTH_URL ?? 'https://crm.aipilots.site'}/api/voice/nova-call/vapi-webhook`,
            metadata: { tenantId, callType: 'monthly_strategy', pattern: strategy.pattern },
          },
        }, { headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' } });

        results.agentCallId = agentRes.data?.id;
      } catch (e: any) { results.agentCallError = e.message; }
    }

    /* ── Client voice call (non-interactive) ─────────────────────── */
    if (clientPhone && VAPI_API_KEY) {
      try {
        const clientRes = await axios.post(`${VAPI_BASE}/call`, {
          name:          `Monthly Client Update — ${targetDomain}`,
          type:          'outboundPhoneCall',
          phoneNumberId: VAPI_DEFAULT_PHONE_NUMBER_ID,
          customer:      { number: clientPhone },
          assistant: {
            name:  agentName,
            voice: { provider: 'openai', voiceId: 'nova' },
            model: { provider: 'openai', model: 'gpt-4o-mini',
              messages: [{ role: 'system', content: `Deliver this message warmly and end the call: "${strategy.clientNarrative}"` }] },
            firstMessage:           strategy.clientNarrative,
            firstMessageMode:       'assistant-speaks-first',
            endCallFunctionEnabled: true,
            maxDurationSeconds:     45,
            recordingEnabled:       true,
          },
        }, { headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' } });
        results.clientCallId = clientRes.data?.id;
      } catch (e: any) { results.clientCallError = e.message; }
    }

    /* ── Emails ──────────────────────────────────────────────────── */
    const emailSvc = new EmailService();
    if (agentEmail) {
      try {
        await (emailSvc as any).resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Nova <nova@aipilots.site>',
          to: agentEmail, subject: `📋 Monthly Strategy — ${targetDomain}`, html: strategy.emailAgentHtml,
        });
        results.agentEmailSent = true;
      } catch (e: any) { results.agentEmailError = e.message; }
    }
    if (clientEmail) {
      try {
        await (emailSvc as any).resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Your Growth Team <nova@aipilots.site>',
          to: clientEmail, subject: `📈 Your Monthly Progress Update`, html: strategy.emailClientHtml,
        });
        results.clientEmailSent = true;
      } catch (e: any) { results.clientEmailError = e.message; }
    }

    /* ── Persist memory ──────────────────────────────────────────── */
    await User.findByIdAndUpdate(tenantId, { $set: {
      'clientVoice.strategyMemory.lastSentAt':         new Date(),
      'clientVoice.strategyMemory.lastPattern':        strategy.pattern,
      'clientVoice.strategyMemory.lastRecommendation': strategy.recommendedNextStep,
      'clientVoice.strategyMemory.lastNarrative':      strategy.agentNarrative.slice(0, 400),
    }});

    const db = mongoose.connection.db!;
    await db.collection('activityLogs').insertOne({
      userId: tenantId, type: 'MONTHLY_STRATEGY_SENT',
      message: `📋 Monthly strategy delivered (pattern: ${strategy.pattern})`,
      level: 'success', metadata: results, timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, ...results });

    // Fire-and-forget: contribute this tenant's patterns to the global network
    // (runs after response is sent — non-blocking)
    fetch(`${process.env.NEXTAUTH_URL ?? 'https://crm.aipilots.site'}/api/admin/global-intelligence/ingest`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tenantId }),
    }).catch(() => {});

  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
