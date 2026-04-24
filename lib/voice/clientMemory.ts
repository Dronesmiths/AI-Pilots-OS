import User from '@/models/User';

const ONE_DAY_MS  = 24 * 60 * 60 * 1000;
const ONE_WEEK_MS = 7  * ONE_DAY_MS;
const MAX_CALLS_PER_WEEK = 2;

export type ClientMemory = {
  lastCallAt?:        Date | null;
  lastMessageType?:   string;
  lastSummary?:       string;
  recentHighlights:   string[];
  callCountThisWeek:  number;
  weekStartedAt?:     Date | null;
};

const EMPTY_MEMORY: ClientMemory = {
  lastCallAt:       null,
  lastMessageType:  undefined,
  lastSummary:      undefined,
  recentHighlights: [],
  callCountThisWeek: 0,
  weekStartedAt:    null,
};

/**
 * Read client voice memory for a tenant.
 * Automatically resets callCountThisWeek if the calendar week has rolled over.
 */
export async function readClientMemory(tenantId: string): Promise<ClientMemory> {
  const tenant = await User.findById(tenantId)
    .select('clientVoice.memory')
    .lean() as any;

  const raw = tenant?.clientVoice?.memory ?? {};

  const mem: ClientMemory = {
    lastCallAt:        raw.lastCallAt       ? new Date(raw.lastCallAt)       : null,
    lastMessageType:   raw.lastMessageType  ?? undefined,
    lastSummary:       raw.lastSummary      ?? undefined,
    recentHighlights:  Array.isArray(raw.recentHighlights) ? raw.recentHighlights : [],
    callCountThisWeek: typeof raw.callCountThisWeek === 'number' ? raw.callCountThisWeek : 0,
    weekStartedAt:     raw.weekStartedAt    ? new Date(raw.weekStartedAt)    : null,
  };

  // Auto-reset weekly counter if we've crossed into a new week
  const now = Date.now();
  if (!mem.weekStartedAt || (now - mem.weekStartedAt.getTime()) > ONE_WEEK_MS) {
    mem.callCountThisWeek = 0;
    mem.weekStartedAt     = new Date();
    // Persist the reset immediately
    await User.findByIdAndUpdate(tenantId, {
      $set: {
        'clientVoice.memory.callCountThisWeek': 0,
        'clientVoice.memory.weekStartedAt':     new Date(),
      },
    });
  }

  return mem;
}

/**
 * Persist updated memory after a call.
 */
export async function updateClientMemory(
  tenantId: string,
  event: { type: string },
  message: string,
  current: ClientMemory
): Promise<void> {
  const highlights = [event.type, ...current.recentHighlights].slice(0, 5);

  await User.findByIdAndUpdate(tenantId, {
    $set: {
      'clientVoice.memory.lastCallAt':        new Date(),
      'clientVoice.memory.lastMessageType':   event.type,
      'clientVoice.memory.lastSummary':       message,
      'clientVoice.memory.recentHighlights':  highlights,
      'clientVoice.memory.callCountThisWeek': (current.callCountThisWeek ?? 0) + 1,
    },
  });
}

/**
 * Frequency guard — returns a reason string if call should be skipped, else null.
 */
export function shouldSkipCall(memory: ClientMemory): string | null {
  if (memory.callCountThisWeek >= MAX_CALLS_PER_WEEK) {
    return `Max ${MAX_CALLS_PER_WEEK} calls/week reached (sent ${memory.callCountThisWeek})`;
  }
  if (memory.lastCallAt) {
    const gapMs = Date.now() - memory.lastCallAt.getTime();
    if (gapMs < ONE_DAY_MS) {
      const hoursAgo = Math.floor(gapMs / 3_600_000);
      return `Last call was only ${hoursAgo}h ago — minimum 24h gap`;
    }
  }
  return null;
}
