export type CallOutcome =
  | 'unknown'
  | 'booked'
  | 'qualified_lead'
  | 'missed_lead'
  | 'not_interested'
  | 'support_request'
  | 'followup_needed'
  | 'spam';

export type CallSentiment = 'positive' | 'neutral' | 'negative' | 'mixed' | 'unknown';

export type OutcomeResult = {
  outcome: CallOutcome;
  sentiment: CallSentiment;
  confidence: number;
};

/**
 * Rule-based outcome + sentiment classifier.
 * Phase 2 will replace this with an LLM call when the budget warrants it.
 */
export function buildCallOutcome(transcript: string): OutcomeResult {
  const t = transcript.toLowerCase();

  if (!t.trim()) {
    return { outcome: 'unknown', sentiment: 'unknown', confidence: 0.1 };
  }

  if (/\b(booked|appointment confirmed|scheduled|see you then|all set)\b/.test(t)) {
    return { outcome: 'booked', sentiment: 'positive', confidence: 0.92 };
  }

  if (/\b(call me back|follow.?up|send me info|email me|send me more)\b/.test(t)) {
    return { outcome: 'followup_needed', sentiment: 'neutral', confidence: 0.82 };
  }

  if (/\bnot interested|stop calling|remove me|take me off\b/.test(t)) {
    return { outcome: 'not_interested', sentiment: 'negative', confidence: 0.9 };
  }

  if (/\b(price|quote|estimate|cost|how much|service area|availability|available)\b/.test(t)) {
    return { outcome: 'qualified_lead', sentiment: 'neutral', confidence: 0.78 };
  }

  if (/\bwrong number|spam|robot|recording\b/.test(t)) {
    return { outcome: 'spam', sentiment: 'negative', confidence: 0.86 };
  }

  if (/\b(problem|issue|support|broken|help|fix|repair)\b/.test(t)) {
    return { outcome: 'support_request', sentiment: 'neutral', confidence: 0.76 };
  }

  return { outcome: 'missed_lead', sentiment: 'mixed', confidence: 0.55 };
}
