import { NextRequest, NextResponse }               from 'next/server';
import mongoose                                    from 'mongoose';
import connectToDatabase                           from '@/lib/mongodb';
import { parseCallIntent }                         from '@/lib/voice/parseCallIntent';
import { intentToDecisionType }                   from '@/lib/voice/buildClientMessage';
import ActionProposalModel                         from '@/models/ActionProposal';
import AgentDecision                               from '@/models/AgentDecision';

// Safe actions that Nova is allowed to trigger via voice approval
const VOICE_SAFE_ACTIONS = new Set(['create_page', 'followup_campaign']);
const MIN_CONFIDENCE_TO_ACT = 0.70;

/**
 * POST /api/voice/nova-call/vapi-webhook
 *
 * Receives Vapi end-of-call report with full transcript.
 * Pipeline:
 *   1. Extract transcript + metadata
 *   2. Parse caller intent
 *   3. Store as NovaMemory + activityLog
 *   4. If high confidence + safe intent → queue action
 *   5. Return 200
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Vapi wraps everything in body.message for webhook events
  const msg      = body?.message ?? body;
  const msgType  = msg?.type ?? '';

  // Only process end-of-call reports
  if (msgType !== 'end-of-call-report') {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const callId     = msg?.call?.id     ?? msg?.id ?? '';
  const transcript = msg?.transcript   ?? msg?.call?.transcript ?? '';
  const metadata   = msg?.call?.metadata ?? msg?.metadata ?? {};
  const recording  = msg?.recordingUrl  ?? msg?.call?.recordingUrl ?? '';
  const duration   = msg?.durationSeconds ?? msg?.call?.duration ?? 0;

  const {
    tenantId,
    keyword    = '',
    actionType = 'create_page',
    actionId   = '',
    summaryId  = '',
  } = metadata;

  if (!tenantId) {
    return NextResponse.json({ error: 'No tenantId in call metadata' }, { status: 400 });
  }

  await connectToDatabase();
  const db = mongoose.connection.db!;

  /* ── 1. Parse intent ─────────────────────────────────────────── */
  const { intent, confidence, reasoning } = parseCallIntent(transcript);

  /* ── 2. Store call record (extends existing ingestVoiceEvent pattern) */
  const callRecord = await db.collection('callrecords').insertOne({
    tenantId,
    callId,
    source:      'nova_outbound',
    direction:   'outbound',
    transcript,
    recordingUrl: recording,
    duration,
    intent,
    confidence,
    intentReasoning: reasoning,
    keyword,
    actionType,
    actionId:    actionId || null,
    summaryId:   summaryId || null,
    metadata,
    createdAt: new Date(),
  });

  /* ── 3. Store as Nova memory ─────────────────────────────────── */
  await db.collection('novamemories').insertOne({
    tenantId,
    type:    'VOICE_CALL_DECISION',
    content: `Operator call completed. Intent: ${intent} (confidence: ${Math.round(confidence * 100)}%). Keyword: "${keyword}". ${reasoning}`,
    metadata: { callId, intent, confidence, keyword, actionType, callRecordId: String(callRecord.insertedId) },
    timestamp: new Date().toISOString(),
  });

  /* ── 3b. Store structured AgentDecision ─────────────────────── */
  const decisionType = intentToDecisionType(intent);
  let agentDecisionId: string | null = null;
  if (intent !== 'unclear' && intent !== 'ask_question') {
    const dec = await AgentDecision.create({
      tenantId,
      decisionType,
      metadata:   { keyword, actionType, count: intent === 'approve_more_pages' ? 3 : 0 },
      source:     'voice_agent',
      callId,
      rawIntent:  intent,
      confidence,
    });
    agentDecisionId = String(dec._id);
  }

  /* ── 4. Log to activityLogs ──────────────────────────────────── */
  const intentEmoji = {
    approve_more_pages: '✅',
    hold:               '⏸️',
    reject:             '❌',
    ask_question:       '❓',
    unclear:            '🔍',
  }[intent] ?? '🔍';

  await db.collection('activityLogs').insertOne({
    userId:    tenantId,
    type:      'VOICE_DECISION',
    message:   `${intentEmoji} Nova call ended — Intent: ${intent} (${Math.round(confidence * 100)}%) — "${keyword}"`,
    level:     intent === 'approve_more_pages' ? 'success' : 'info',
    metadata:  {
      callId, transcript: transcript.slice(0, 500),
      intent, confidence, reasoning, keyword, actionType,
    },
    timestamp: new Date().toISOString(),
  });

  /* ── 5. Route intent to action engine ───────────────────────── */
  let actionQueued = false;
  let actionResult: any = null;

  if (
    intent === 'approve_more_pages' &&
    confidence >= MIN_CONFIDENCE_TO_ACT &&
    VOICE_SAFE_ACTIONS.has(actionType ?? 'create_page')
  ) {
    try {
      // Create new action proposals for 3 more pages in the same cluster
      const proposals = await Promise.allSettled(
        Array.from({ length: 3 }, (_, i) =>
          ActionProposalModel.create({
            tenantId,
            type:        'create_page',
            title:       `Voice-approved: Create page ${i + 1} in "${keyword}" cluster`,
            description: `Operator approved via outbound call. Confidence: ${Math.round(confidence * 100)}%.`,
            payload:     { keyword, intent: 'organic', source: 'voice_approval', cluster_index: i + 1 },
            confidence,
            status:      'approved',   // voice approval = pre-approved
            approvedAt:  new Date(),
            approvedBy:  'nova_voice',
            reviewRequired: false,
          })
        )
      );

      actionQueued = true;
      actionResult = {
        proposed: proposals.filter(p => p.status === 'fulfilled').length,
        keyword,
      };

      await db.collection('activityLogs').insertOne({
        userId:    tenantId,
        type:      'ACTION_QUEUED',
        message:   `🤖 Nova queued 3 pages from voice approval — keyword: "${keyword}"`,
        level:     'success',
        metadata:  { keyword, confidence, source: 'voice_approval' },
        timestamp: new Date().toISOString(),
      });

      // 🔔 Trigger client briefing call (non-fatal, fire-and-forget)
      // Nova calls the end client with a "we" language update
      try {
        const { triggerClientBriefing } = await import('@/lib/voice/triggerClientBriefing');
        triggerClientBriefing({
          tenantId,
          eventType: 'page_published',
          keyword,
        }).catch(() => {});
      } catch { /* non-fatal */ }
    } catch (err: any) {
      console.error('[VAPI WEBHOOK] Action queue failed:', err?.message);
    }
  } else if (intent === 'hold' || intent === 'reject') {
    // Log decline — no action taken
    await db.collection('activityLogs').insertOne({
      userId:    tenantId,
      type:      'VOICE_DECISION',
      message:   `🛑 Operator ${intent === 'reject' ? 'rejected' : 'held'} action via call — "${keyword}"`,
      level:     'info',
      metadata:  { callId, intent, keyword },
      timestamp: new Date().toISOString(),
    });
  } else if (confidence < MIN_CONFIDENCE_TO_ACT || intent === 'unclear') {
    // Low confidence — mark for human review
    await db.collection('activityLogs').insertOne({
      userId:    tenantId,
      type:      'VOICE_REVIEW_REQUIRED',
      message:   `🔍 Voice decision unclear — marked for human review (confidence: ${Math.round(confidence * 100)}%)`,
      level:     'warning',
      metadata:  { callId, intent, confidence, transcript: transcript.slice(0, 300) },
      timestamp: new Date().toISOString(),
    });
  }

  return NextResponse.json({
    ok:           true,
    callId,
    intent,
    confidence,
    actionQueued,
    actionResult,
  });
}
