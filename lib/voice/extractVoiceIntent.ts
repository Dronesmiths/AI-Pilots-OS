/**
 * lib/voice/extractVoiceIntent.ts
 *
 * Lightweight keyword-based intent classifier for voice transcripts.
 * Returns intent type, confidence, inferred tone, and an optional topic key.
 *
 * This is a practical starting point — replace with an LLM classifier
 * (or a sentence embedding model) when precision needs to improve.
 *
 * Priority order:
 *   reject > approve > question > command > general
 * (reject before approve so "don't approve" doesn't misfire)
 */

export type VoiceIntentType = 'approve' | 'reject' | 'question' | 'command' | 'general';
export type VoiceTone = 'calm' | 'urgent' | 'reflective' | 'executive' | 'warm';

export interface VoiceIntent {
  type:       VoiceIntentType;
  confidence: number;
  tone:       VoiceTone;
  topicKey?:  string;
}

export function extractVoiceIntent(transcript: string): VoiceIntent {
  if (!transcript?.trim()) {
    return { type: 'general', confidence: 0.3, tone: 'calm' };
  }

  const t = transcript.toLowerCase();

  // Reject signals (strongest — check before approve)
  if (/\b(reject|no stop|don't do|don't apply|block that|cancel|revert|undo)\b/.test(t)) {
    return { type: 'reject', confidence: 0.92, tone: 'executive' };
  }

  // Approve signals
  if (/\b(approve|yes do it|apply that|go ahead|confirm|execute that|let it through)\b/.test(t)) {
    return { type: 'approve', confidence: 0.90, tone: 'executive' };
  }

  // Question / explanation request
  if (/\b(why|explain|tell me|what happened|how did|what did|show me|describe)\b/.test(t)) {
    return { type: 'question', confidence: 0.82, tone: 'reflective' };
  }

  // Command / execution
  if (/\b(run|execute|trigger|start|launch|fire|initiate)\b/.test(t)) {
    return { type: 'command', confidence: 0.82, tone: 'urgent' };
  }

  return { type: 'general', confidence: 0.50, tone: 'calm' };
}
