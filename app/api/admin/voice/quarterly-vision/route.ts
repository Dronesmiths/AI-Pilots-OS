import { NextRequest, NextResponse } from 'next/server';
import axios                         from 'axios';
import mongoose                      from 'mongoose';
import connectToDatabase             from '@/lib/mongodb';
import User                          from '@/models/User';
import { buildQuarterlyVision }      from '@/lib/vision/buildQuarterlyVision';
import type { LockedDirection }       from '@/lib/vision/buildQuarterlyVision';
import { EmailService }              from '@/lib/email';

const VAPI_BASE = 'https://api.vapi.ai';

/**
 * POST /api/admin/voice/quarterly-vision
 *
 * Generates and delivers the quarterly vision report.
 * Agent receives interactive call presenting 3 direction options.
 * Client receives a simplified inspirational update.
 *
 * Body: { tenantId, force? }
 *
 * PATCH /api/admin/voice/quarterly-vision
 * Locks agent direction choice into vision memory.
 * Body: { tenantId, direction: LockedDirection }
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

    // 85-day dedup guard
    const lastSent = tenant?.clientVoice?.visionMemory?.lastSentAt;
    if (!force && lastSent) {
      const daysSince = (Date.now() - new Date(lastSent).getTime()) / 86_400_000;
      if (daysSince < 85) {
        return NextResponse.json({ skipped: true, reason: `Vision report sent ${Math.floor(daysSince)} days ago` });
      }
    }

    const brandType    = tenant?.clientVoice?.brandVoiceProfile?.type ?? 'professional';
    const agentName    = tenant?.clientVoice?.agentName ?? 'Your Business Assistant';
    const targetDomain = tenant?.targetDomain ?? tenant?.onboardingConfig?.targetDomain ?? '';
    const agentPhone   = tenant?.phone;
    const clientPhone  = tenant?.onboardingConfig?.clientPhone;
    const agentEmail   = tenant?.email;
    const clientEmail  = tenant?.onboardingConfig?.clientReportingEmail;

    const vision = await buildQuarterlyVision({ tenantId, tenantName: tenant.name ?? '', targetDomain, brandType });

    const results: Record<string, any> = { position: vision.position };

    /* ── Agent voice call (interactive — presents 3 directions) ── */
    if (agentPhone && VAPI_API_KEY) {
      try {
        const res = await axios.post(`${VAPI_BASE}/call`, {
          name: `Quarterly Vision — ${targetDomain}`, type: 'outboundPhoneCall',
          phoneNumberId: VAPI_DEFAULT_PHONE_NUMBER_ID,
          customer:      { number: agentPhone },
          assistant: {
            name:  'Nova',
            voice: { provider: 'openai', voiceId: 'nova' },
            model: { provider: 'openai', model: 'gpt-4o-mini',
              messages: [{ role: 'system', content:
                `You are Nova delivering a quarterly vision update. Present the 3 direction options clearly. Ask the operator to choose one. When they respond, confirm their choice and tell them Nova will lock that direction in.`
              }],
            },
            firstMessage:           vision.agentVoice,
            firstMessageMode:       'assistant-speaks-first',
            endCallFunctionEnabled: true,
            maxDurationSeconds:     180,
            recordingEnabled:       true,
            serverUrl: `${NEXTAUTH_URL ?? 'https://crm.aipilots.site'}/api/voice/nova-call/vapi-webhook`,
            metadata: { tenantId, callType: 'quarterly_vision', position: vision.position },
          },
        }, { headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' } });
        results.agentCallId = res.data?.id;
      } catch (e: any) { results.agentCallError = e.message; }
    }

    /* ── Client voice call (inspirational) ───────────────────────── */
    if (clientPhone && VAPI_API_KEY) {
      try {
        const res = await axios.post(`${VAPI_BASE}/call`, {
          name: `Quarterly Client Vision — ${targetDomain}`, type: 'outboundPhoneCall',
          phoneNumberId: VAPI_DEFAULT_PHONE_NUMBER_ID,
          customer:      { number: clientPhone },
          assistant: {
            name:  agentName,
            voice: { provider: 'openai', voiceId: 'nova' },
            model: { provider: 'openai', model: 'gpt-4o-mini',
              messages: [{ role: 'system', content: `Deliver this message warmly and end the call: "${vision.clientVoice}"` }] },
            firstMessage: vision.clientVoice,
            firstMessageMode: 'assistant-speaks-first',
            endCallFunctionEnabled: true,
            maxDurationSeconds: 60,
          },
        }, { headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' } });
        results.clientCallId = res.data?.id;
      } catch (e: any) { results.clientCallError = e.message; }
    }

    /* ── Emails ──────────────────────────────────────────────────── */
    const emailSvc = new EmailService();
    if (agentEmail) {
      try {
        await (emailSvc as any).resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Nova <nova@aipilots.site>',
          to: agentEmail, subject: `🧭 Quarterly Vision — ${targetDomain}`, html: vision.emailAgentHtml,
        });
        results.agentEmailSent = true;
      } catch (e: any) { results.agentEmailError = e.message; }
    }
    if (clientEmail) {
      try {
        await (emailSvc as any).resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'Your Growth Team <nova@aipilots.site>',
          to: clientEmail, subject: `🚀 Your Quarterly Growth Update`, html: vision.emailClientHtml,
        });
        results.clientEmailSent = true;
      } catch (e: any) { results.clientEmailError = e.message; }
    }

    /* ── Persist vision memory ───────────────────────────────────── */
    await User.findByIdAndUpdate(tenantId, { $set: {
      'clientVoice.visionMemory.lastSentAt':    new Date(),
      'clientVoice.visionMemory.lastPosition':  vision.position,
      'clientVoice.visionMemory.lastNarrative': vision.agentVoice.slice(0, 500),
    }});

    const db = mongoose.connection.db!;
    await db.collection('activityLogs').insertOne({
      userId: tenantId, type: 'QUARTERLY_VISION_SENT',
      message: `🧭 Quarterly vision delivered (position: ${vision.position})`,
      level: 'success', metadata: results, timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, ...results, directionOptions: vision.directionOptions });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/voice/quarterly-vision
 * Lock in agent's chosen direction — influences action engine.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { tenantId, direction } = await req.json() as { tenantId: string; direction: LockedDirection };
    if (!tenantId || !direction) return NextResponse.json({ error: 'tenantId and direction required' }, { status: 400 });

    await connectToDatabase();
    await User.findByIdAndUpdate(tenantId, {
      $set: { 'clientVoice.visionMemory.lockedDirection': direction },
    });

    const db = mongoose.connection.db!;
    await db.collection('activityLogs').insertOne({
      userId: tenantId, type: 'VISION_DIRECTION_LOCKED',
      message: `🔒 Quarterly direction locked: ${direction.replace(/_/g,' ')}`,
      level: 'info', metadata: { direction }, timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, lockedDirection: direction });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
