/**
 * lib/voice/applyTone.ts
 *
 * Wraps a voice response string with a brief tonal prefix based on mode.
 * Keeps Nova sounding consistent in character while adapting to the moment.
 *
 * Tones:
 *   urgent      → direct opener, no softening: "Listen carefully."
 *   reflective  → framing opener: "Here's what I'm seeing."
 *   executive   → no prefix — direct as-is (executive tone is already clear)
 *   warm        → light acknowledgment opener
 *   calm        → no prefix (default clean state)
 */

import type { VoiceTone } from './extractVoiceIntent';

const PREFIXES: Partial<Record<VoiceTone, string>> = {
  urgent:     'Listen carefully. ',
  reflective: "Here's what I'm seeing. ",
  warm:       'Good to hear from you. ',
};

export function applyTone(text: string, tone: VoiceTone): string {
  const prefix = PREFIXES[tone];
  return prefix ? prefix + text : text;
}
