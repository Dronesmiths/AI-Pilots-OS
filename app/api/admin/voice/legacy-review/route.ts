import { NextRequest, NextResponse } from 'next/server';
import axios                         from 'axios';
import mongoose                      from 'mongoose';
import connectToDatabase             from '@/lib/mongodb';
import User                          from '@/models/User';
import LegacyMemory                  from '@/models/LegacyMemory';
import { extractIdentity }           from '@/lib/legacy/extractIdentity';
import { detectArchetype, calculateLegacyScore } from '@/lib/legacy/detectArchetype';
import { buildLegacyNarrative }      from '@/lib/legacy/buildLegacyNarrative';
import { EmailService }              from '@/lib/email';

const VAPI_BASE = 'https://api.vapi.ai';

/**
 * POST /api/admin/voice/legacy-review
 *
 * Computes and delivers the legacy identity review.
 * Runs infrequently — designed for 6–12 month cadence.
 *
 * Body: { tenantId, force? }
 *
 * GET /api/admin/voice/legacy-review?tenantId=...
 * Returns current legacy state without triggering delivery.
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

    // Dedup — default 180 day minimum between reviews
    const existing = await LegacyMemory.findOne({ tenantId }).lean() as any;
    if (!force && existing?.updatedAt) {
      const daysSince = (Date.now() - new Date(existing.updatedAt).getTime()) / 86_400_000;
      if (daysSince < 180) {
        return NextResponse.json({
          skipped: true,
          reason: `Legacy review completed ${Math.floor(daysSince)} days ago`,
          legacy: existing,
        });
      }
    }

    const db = mongoose.connection.db!;
    const targetDomain = tenant?.targetDomain ?? tenant?.onboardingConfig?.targetDomain ?? '';
    const agentPhone   = tenant?.phone;
    const clientPhone  = tenant?.onboardingConfig?.clientPhone;
    const agentEmail   = tenant?.email;
    const clientEmail  = tenant?.onboardingConfig?.clientReportingEmail;
    const agentName    = tenant?.clientVoice?.agentName ?? 'Your Business Assistant';

    /* ── Aggregate all historical signals ─────────────────────── */
    const [allActions, allActionTypes] = await Promise.all([
      db.collection('actionproposals')
        .find({ tenantId, status: 'completed' })
        .limit(500)
        .toArray(),
      db.collection('actionproposals')
        .distinct('type', { tenantId, status: 'completed' }),
    ]);

    const achievedMilestones: string[] =
      tenant?.clientVoice?.milestones?.achieved ?? existing?.historicalMilestones?.map((m: any) => m.type) ?? [];

    const monthlyPatternHistory: string[] =
      existing?.monthlyPatternHistory ??
      (tenant?.clientVoice?.strategyMemory?.lastPattern ? [tenant.clientVoice.strategyMemory.lastPattern] : []);

    const quarterlyPositionHistory: string[] =
      existing?.quarterlyPositionHistory ??
      (tenant?.clientVoice?.visionMemory?.lastPosition ? [tenant.clientVoice.visionMemory.lastPosition] : []);

    /* ── Identity extraction ──────────────────────────────────── */
    const identity = extractIdentity({
      actionTypes:              allActionTypes as string[],
      monthlyPatternHistory,
      quarterlyPositionHistory,
      achievedMilestones,
      targetDomain,
    });

    /* ── Archetype + legacy score ─────────────────────────────── */
    const archetype   = detectArchetype(identity);
    const legacyScore = calculateLegacyScore({
      totalPages:               allActions.filter(a => a.type === 'create_page').length,
      monthlyPatternHistory,
      quarterlyPositionHistory,
      achievedMilestones,
    });

    /* ── Build narrative ──────────────────────────────────────── */
    const narratives = buildLegacyNarrative({
      identity,
      archetype,
      legacyScore,
      totalPages: allActions.filter(a => a.type === 'create_page').length,
      tenantName: tenant.name ?? '',
      targetDomain,
    });

    /* ── Detect voice tone evolution ─────────────────────────── */
    const prevArchetype = existing?.growthArchetype;
    const evolutionEntry = prevArchetype && prevArchetype !== archetype
      ? { date: new Date(), tone: archetype, trigger: `Evolved from ${prevArchetype}` }
      : null;

    /* ── Persist to LegacyMemory ─────────────────────────────── */
    const legacyUpdate: any = {
      tenantId,
      dominantThemes:           identity.dominantThemes,
      contentDNA:               identity.contentDNA,
      audienceType:             identity.audienceType,
      growthArchetype:          archetype,
      legacyScore,
      monthlyPatternHistory:    [
        ...monthlyPatternHistory,
        ...(tenant?.clientVoice?.strategyMemory?.lastPattern ?? []),
      ].slice(-24),  // keep last 24 months
      quarterlyPositionHistory: [
        ...quarterlyPositionHistory,
        ...(tenant?.clientVoice?.visionMemory?.lastPosition ? [tenant.clientVoice.visionMemory.lastPosition] : []),
      ].slice(-12),  // keep last 12 quarters
      lastAgentNarrative:   narratives.agentNarrative.slice(0, 800),
      lastClientNarrative:  narratives.clientNarrative.slice(0, 400),
      updatedAt:            new Date(),
    };

    if (evolutionEntry) {
      legacyUpdate.$push = { brandVoiceEvolution: evolutionEntry };
    }

    // Add any newly achieved milestones to historicalMilestones
    const newMilestones = achievedMilestones.map((type: string) => ({
      date: new Date(), type, description: type.replace(/_/g, ' '),
    }));

    await LegacyMemory.findOneAndUpdate(
      { tenantId },
      { $set: legacyUpdate, $addToSet: { historicalMilestones: { $each: newMilestones } } },
      { upsert: true, new: true }
    );

    const results: Record<string, any> = { archetype, legacyScore, identity };

    /* ── Deliver: agent voice ─────────────────────────────────── */
    if (agentPhone && VAPI_API_KEY) {
      try {
        const res = await axios.post(`${VAPI_BASE}/call`, {
          name: `Legacy Review — ${targetDomain}`, type: 'outboundPhoneCall',
          phoneNumberId: VAPI_DEFAULT_PHONE_NUMBER_ID,
          customer: { number: agentPhone },
          assistant: {
            name:  'Nova',
            voice: { provider: 'openai', voiceId: 'nova' },
            model: { provider: 'openai', model: 'gpt-4o-mini',
              messages: [{ role: 'system', content:
                `You are Nova delivering a long-term brand identity review. Deliver this message slowly and with weight — this is not a routine update. Speak as if this genuinely matters: "${narratives.agentVoiceScript}". End the call with "This is what we're building."` }],
            },
            firstMessage:           narratives.agentVoiceScript,
            firstMessageMode:       'assistant-speaks-first',
            endCallMessage:         "This is what we're building.",
            endCallFunctionEnabled: true,
            maxDurationSeconds:     90,
            recordingEnabled:       true,
            metadata: { tenantId, callType: 'legacy_review', archetype, legacyScore },
          },
        }, { headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' } });
        results.agentCallId = res.data?.id;
      } catch (e: any) { results.agentCallError = e.message; }
    }

    /* ── Deliver: client voice (optional, for significant milestones) ── */
    if (clientPhone && VAPI_API_KEY && legacyScore >= 30) {
      try {
        const res = await axios.post(`${VAPI_BASE}/call`, {
          name: `Long-Term Update — ${targetDomain}`, type: 'outboundPhoneCall',
          phoneNumberId: VAPI_DEFAULT_PHONE_NUMBER_ID,
          customer: { number: clientPhone },
          assistant: {
            name:  agentName,
            voice: { provider: 'openai', voiceId: 'nova' },
            model: { provider: 'openai', model: 'gpt-4o-mini',
              messages: [{ role: 'system', content: `Deliver this warmly and meaningfully: "${narratives.clientNarrative}" Then say "This is what long-term looks like." and end the call.` }],
            },
            firstMessage:           narratives.clientNarrative,
            firstMessageMode:       'assistant-speaks-first',
            endCallFunctionEnabled: true,
            maxDurationSeconds:     60,
          },
        }, { headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' } });
        results.clientCallId = res.data?.id;
      } catch (e: any) { results.clientCallError = e.message; }
    }

    /* ── Deliver: emails ─────────────────────────────────────── */
    const emailSvc = new EmailService();
    if (agentEmail) {
      try {
        await (emailSvc as any).resend.emails.send({
          from:    process.env.RESEND_FROM_EMAIL || 'Nova <nova@aipilots.site>',
          to:      agentEmail,
          subject: `🏛️ Legacy Review — ${targetDomain}`,
          html:    narratives.emailAgentHtml,
        });
        results.agentEmailSent = true;
      } catch (e: any) { results.agentEmailError = e.message; }
    }
    if (clientEmail && legacyScore >= 30) {
      try {
        await (emailSvc as any).resend.emails.send({
          from:    process.env.RESEND_FROM_EMAIL || 'Your Growth Team <nova@aipilots.site>',
          to:      clientEmail,
          subject: `🌱 Something worth sharing`,
          html:    narratives.emailClientHtml,
        });
        results.clientEmailSent = true;
      } catch (e: any) { results.clientEmailError = e.message; }
    }

    /* ── Log ─────────────────────────────────────────────────── */
    await db.collection('activityLogs').insertOne({
      userId: tenantId, type: 'LEGACY_REVIEW_RUN',
      message: `🏛️ Legacy review — archetype: ${archetype}, score: ${legacyScore}/100`,
      level: 'success', metadata: results, timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, archetype, legacyScore, identity, ...results });

  } catch (err: any) {
    console.error('[LEGACY REVIEW]', err?.message);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}

/**
 * GET /api/admin/voice/legacy-review?tenantId=...
 * Returns current legacy state for War Room display.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  await connectToDatabase();
  const legacy = await LegacyMemory.findOne({ tenantId }).lean();
  return NextResponse.json({ success: true, legacy: legacy ?? null });
}
