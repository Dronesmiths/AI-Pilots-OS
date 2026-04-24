/**
 * Signal extractor — runs at ingest time, converts raw transcript into
 * structured boolean intent signals.
 *
 * Keeping this as pure regex for Phase 2. Phase 3 can upgrade
 * individual signals to LLM classification when needed.
 */
export type CallSignals = {
  hasPricingIntent:  boolean;
  hasFollowupIntent: boolean;
  hasObjection:      boolean;
  hasHighIntent:     boolean;
};

export function extractSignals(transcript: string): CallSignals {
  const t = transcript.toLowerCase();

  return {
    hasPricingIntent:  /\b(price|cost|quote|estimate|how much|rate|rates|charge)\b/.test(t),
    hasFollowupIntent: /\b(call me back|follow.?up|reach out|get back to me|email me|send me)\b/.test(t),
    hasObjection:      /\b(too expensive|not ready|just looking|not interested|maybe later|think about it)\b/.test(t),
    hasHighIntent:     /\b(book|schedule|ready to start|sign up|get started|let's do it|appointment)\b/.test(t),
  };
}
