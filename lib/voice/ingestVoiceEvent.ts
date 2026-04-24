import mongoose from 'mongoose';
import CallRecordModel from '@/models/CallRecord';
import { normalizeVoiceEvent } from '@/lib/voice/normalizeVoiceEvent';
import { buildCallOutcome }    from '@/lib/voice/buildCallOutcome';
import { buildCallSummary }    from '@/lib/voice/buildCallSummary';
import { extractSignals }      from '@/lib/voice/extractSignals';

export type IngestResult = {
  callRecordId: string;
  outcome:      string;
  summary:      string;
};

/**
 * Phase 1 Voice Ingestion Pipeline
 * ─────────────────────────────────
 * 1. Normalize raw Vapi / Twilio / manual payload
 * 2. Classify outcome + sentiment (rule-based)
 * 3. Persist CallRecord in MongoDB
 * 4. Write a NovaMemory entry (for executive cognition loops)
 * 5. Emit VOICE_INGESTED to the existing activityLogs collection
 *
 * Phase 1 deliberately does NOT auto-trigger downstream actions —
 * that is Phase 2 territory once patterns emerge.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ingestVoiceEvent(raw: any): Promise<IngestResult> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('No active MongoDB connection');

  /* ── 1. Normalize ─────────────────────────────────────────── */
  const event = normalizeVoiceEvent(raw);

  if (!event.tenantId) {
    throw new Error('Missing tenantId in voice event payload');
  }

  /* ── 2. Classify ──────────────────────────────────────────── */
  const classification = buildCallOutcome(event.transcript);
  const summary        = buildCallSummary(event.transcript, classification.outcome);
  const signals        = extractSignals(event.transcript);

  /* ── 3. Persist CallRecord ────────────────────────────────── */
  const callRecord = await CallRecordModel.create({
    tenantId:               event.tenantId,
    source:                 event.source,
    externalCallId:         event.externalCallId,
    externalConversationId: event.externalConversationId,
    from:                   event.from,
    to:                     event.to,
    startedAt:              event.startedAt,
    endedAt:                event.endedAt,
    durationSec:            event.durationSec || 0,
    transcript:             event.transcript,
    summary,
    outcome:                classification.outcome,
    sentiment:              classification.sentiment,
    confidence:             classification.confidence,
    signals,
    metadata:               event.metadata || {},
    processed:              true,
    processedAt:            new Date(),
  });

  /* ── 4. Insert NovaMemory entry ───────────────────────────── */
  const memoryResult = await db.collection('novaMemories').insertOne({
    tenantId:     event.tenantId,
    type:         'call_outcome',
    title:        `📞 Call: ${classification.outcome}`,
    summary,
    outcome:      classification.outcome,
    sentiment:    classification.sentiment,
    confidence:   classification.confidence,
    source:       event.source,
    callRecordId: String(callRecord._id),
    timestamp:    new Date(),
    metadata: {
      durationSec: event.durationSec || 0,
      from:        event.from,
      to:          event.to,
    },
  });

  /* ── 5. Emit VOICE_INGESTED activity event ────────────────── */
  await db.collection('activityLogs').insertOne({
    userId:    event.tenantId,
    type:      'VOICE_INGESTED',
    message:   `📞 Voice event ingested: ${classification.outcome} (${event.source})`,
    level:     outcomeLevel(classification.outcome),
    metadata: {
      callRecordId: String(callRecord._id),
      memoryId:     String(memoryResult.insertedId),
      outcome:      classification.outcome,
      source:       event.source,
      sentiment:    classification.sentiment,
      durationSec:  event.durationSec || 0,
    },
    timestamp: new Date().toISOString(),
  });

  /* ── 6. Back-patch memoryId + activityLogged ──────────────── */
  await CallRecordModel.updateOne(
    { _id: callRecord._id },
    { $set: { memoryId: String(memoryResult.insertedId), activityLogged: true } }
  );

  return {
    callRecordId: String(callRecord._id),
    outcome:      classification.outcome,
    summary,
  };
}

function outcomeLevel(outcome: string): string {
  if (outcome === 'booked')         return 'success';
  if (outcome === 'qualified_lead') return 'success';
  if (outcome === 'not_interested') return 'warning';
  if (outcome === 'spam')           return 'warning';
  return 'info';
}
