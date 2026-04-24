export type NormalizedVoiceEvent = {
  tenantId: string;
  source: 'twilio' | 'vapi' | 'manual';
  externalCallId?: string;
  externalConversationId?: string;
  from?: string;
  to?: string;
  startedAt?: Date;
  endedAt?: Date;
  durationSec?: number;
  transcript: string;
  metadata?: Record<string, unknown>;
};

function asDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeVoiceEvent(input: any): NormalizedVoiceEvent {
  const source = input?.source;

  if (source === 'vapi') {
    return {
      tenantId:               String(input.tenantId || ''),
      source:                 'vapi',
      externalCallId:         input.callId || input.id,
      externalConversationId: input.conversationId,
      from:                   input.from,
      to:                     input.to,
      startedAt:              asDate(input.startedAt),
      endedAt:                asDate(input.endedAt),
      durationSec:            Number(input.durationSec || 0),
      transcript:             String(input.transcript || ''),
      metadata:               input.metadata || {},
    };
  }

  if (source === 'twilio') {
    return {
      tenantId:               String(input.tenantId || ''),
      source:                 'twilio',
      externalCallId:         input.callSid,
      externalConversationId: input.conversationSid,
      from:                   input.from,
      to:                     input.to,
      startedAt:              asDate(input.startedAt),
      endedAt:                asDate(input.endedAt),
      durationSec:            Number(input.durationSec || 0),
      transcript:             String(input.transcript || ''),
      metadata:               input.metadata || {},
    };
  }

  // manual / fallback
  return {
    tenantId:    String(input.tenantId || ''),
    source:      'manual',
    externalCallId: input.id,
    from:        input.from,
    to:          input.to,
    startedAt:   asDate(input.startedAt),
    endedAt:     asDate(input.endedAt),
    durationSec: Number(input.durationSec || 0),
    transcript:  String(input.transcript || ''),
    metadata:    input.metadata || {},
  };
}
