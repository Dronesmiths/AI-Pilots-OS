/**
 * parseCallIntent.ts
 * ──────────────────
 * Classifies a call transcript into a structured intent using
 * keyword matching first (fast, no LLM cost), with a confidence score.
 *
 * Intent enum:
 *   approve_more_pages  — user wants Nova to proceed
 *   hold                — user wants to pause/wait
 *   reject              — user explicitly declines
 *   ask_question        — user asked a question (needs human review)
 *   unclear             — not enough signal
 */

export type CallIntent =
  | 'approve_more_pages'
  | 'hold'
  | 'reject'
  | 'ask_question'
  | 'unclear';

export type IntentResult = {
  intent:     CallIntent;
  confidence: number;   // 0–1
  reasoning:  string;
};

// ── Signal keyword banks ──────────────────────────────────────────
const APPROVE_SIGNALS = [
  'yes', 'yeah', 'sure', 'go ahead', 'do it', 'approve', 'sounds good',
  'absolutely', 'please', 'of course', 'let\'s do it', 'great', 'yep',
  'create more', 'make more', 'build more', 'proceed', 'go for it',
  'more pages', 'three more', '3 more',
];

const HOLD_SIGNALS = [
  'hold', 'wait', 'not yet', 'later', 'maybe later', 'let me think',
  'come back', 'pause', 'give me a moment', 'hold off', 'not right now',
  'i\'ll think', 'let me check',
];

const REJECT_SIGNALS = [
  'no', 'nope', 'don\'t', 'stop', 'skip', 'cancel', 'reject', 'no thanks',
  'not interested', 'nevermind', 'never mind', 'halt', 'negative',
];

const QUESTION_SIGNALS = [
  'what', 'why', 'how', 'when', 'which', 'where', 'can you', 'could you',
  'tell me', 'explain', '?',
];

/**
 * parseCallIntent
 *
 * @param transcript — full call transcript string
 * @returns IntentResult
 */
export function parseCallIntent(transcript: string): IntentResult {
  if (!transcript || transcript.trim().length < 3) {
    return { intent: 'unclear', confidence: 0, reasoning: 'Empty or very short transcript.' };
  }

  const t = transcript.toLowerCase();

  // Extract only the CALLER (non-Nova) side if we can detect it
  // Transcripts often contain "User: ..." or "Customer: ..." lines
  const callerLines = t
    .split('\n')
    .filter(l =>
      l.startsWith('user:') ||
      l.startsWith('customer:') ||
      l.startsWith('caller:') ||
      (!l.startsWith('assistant:') && !l.startsWith('nova:') && !l.startsWith('agent:') && l.trim().length > 0)
    )
    .join(' ');

  const target = callerLines.length > 10 ? callerLines : t;

  // Score each category
  const score = (signals: string[]) =>
    signals.filter(s => target.includes(s)).length;

  const approveScore  = score(APPROVE_SIGNALS);
  const holdScore     = score(HOLD_SIGNALS);
  const rejectScore   = score(REJECT_SIGNALS);
  const questionScore = score(QUESTION_SIGNALS);

  const total = approveScore + holdScore + rejectScore + Math.ceil(questionScore / 2);

  // Reject overrides when strongly present
  if (rejectScore > 0 && rejectScore >= approveScore) {
    return {
      intent: 'reject',
      confidence: Math.min(0.55 + rejectScore * 0.15, 0.95),
      reasoning: `Detected ${rejectScore} reject signal(s): ${REJECT_SIGNALS.filter(s => target.includes(s)).join(', ')}`,
    };
  }

  if (approveScore > 0) {
    return {
      intent: 'approve_more_pages',
      confidence: Math.min(0.6 + approveScore * 0.1, 0.97),
      reasoning: `Detected ${approveScore} approval signal(s): ${APPROVE_SIGNALS.filter(s => target.includes(s)).join(', ')}`,
    };
  }

  if (holdScore > 0) {
    return {
      intent: 'hold',
      confidence: Math.min(0.55 + holdScore * 0.1, 0.90),
      reasoning: `Detected ${holdScore} hold signal(s): ${HOLD_SIGNALS.filter(s => target.includes(s)).join(', ')}`,
    };
  }

  if (questionScore >= 2) {
    return {
      intent: 'ask_question',
      confidence: 0.6,
      reasoning: `Detected question language — routing to human review.`,
    };
  }

  return {
    intent: 'unclear',
    confidence: 0.2,
    reasoning: `No strong signals found in transcript (length: ${target.length} chars).`,
  };
}
