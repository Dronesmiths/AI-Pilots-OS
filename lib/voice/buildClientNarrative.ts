import type { ClientMemory }                  from './clientMemory';
import { getToneProfile, buildBodyForStyle }   from './brandVoice';
import { getMomentumLine }                     from './getMomentumState';
import type { MomentumState }                  from './getMomentumState';

/**
 * buildClientNarrative.ts (v2)
 * ─────────────────────────────
 * Generates a dynamic, memory-aware, brand-voiced, momentum-aware
 * client voice update. Four layers compose the final message:
 *
 *   BRAND TONE (contractor/professional/startup/ministry)
 *   + EVENT CONTEXT (what just happened)
 *   + MOMENTUM (where the client is in their journey)
 *   + MEMORY (continuity — references prior activity)
 *   = message that feels alive, intentional, and on-brand
 */

type NarrativeInput = {
  eventType:      string;
  decisionType?:  string;
  memory:         ClientMemory;
  targetDomain?:  string;
  brandType?:     string;         // 'contractor' | 'professional' | 'startup' | 'ministry'
  momentumState?: MomentumState;
};

const CONTINUITY_LINES = [
  'Just building on what we started earlier this week.',
  "We've been making steady progress over the last few updates.",
  'This is all part of what we\'ve been working on.',
  'We\'re continuing the work we kicked off recently.',
];

function pickFresh<T>(arr: T[], exclude?: T): T {
  const filtered = arr.filter(x => x !== exclude);
  return filtered[Math.floor(Math.random() * filtered.length)] ?? arr[0];
}

export function buildClientNarrative(input: NarrativeInput): string {
  const {
    eventType,
    decisionType,
    memory,
    brandType     = 'professional',
    momentumState = 'early',
  } = input;

  const profile = getToneProfile(brandType);
  const isFirstCall = memory.callCountThisWeek === 0 && !memory.lastCallAt;

  /* ── Intro ────────────────────────────────────────────────────── */
  // First calls of the week get a slightly warmer intro
  const lastIntroUsed = memory.lastSummary?.split(' ').slice(0, 3).join(' ');
  const intro = pickFresh(profile.intros, lastIntroUsed);

  /* ── Body — brand-styled body for this event ─────────────────── */
  const body = buildBodyForStyle(profile.bodyStyle, eventType, momentumState);

  /* ── Decision layer (expands the direction) ──────────────────── */
  let decisionLine = '';
  if (decisionType === 'expand_cluster' && profile.bodyStyle !== 'direct') {
    decisionLine = ' We\'re continuing to build on that to strengthen your reach.';
  } else if (decisionType === 'expand_cluster') {
    decisionLine = ' We\'re continuing to build on that.';
  } else if (decisionType === 'switch_blog') {
    decisionLine = ' We\'re also broadening your content to reach more people.';
  }

  /* ── Momentum line ───────────────────────────────────────────── */
  // Only add on non-first calls so we don't front-load too much
  const momentumLine = !isFirstCall ? ` ${getMomentumLine(momentumState)}` : '';

  /* ── Continuity hint ─────────────────────────────────────────── */
  const showContinuity = !isFirstCall && memory.recentHighlights.length > 1;
  const continuityLine = showContinuity
    ? ` ${pickFresh(CONTINUITY_LINES, memory.lastSummary)}`
    : '';

  /* ── Closing ─────────────────────────────────────────────────── */
  const lastClosing = memory.lastSummary
    ? profile.closings.find(c => memory.lastSummary!.includes(c))
    : undefined;
  const closing = pickFresh(profile.closings, lastClosing);

  /* ── Assemble ─────────────────────────────────────────────────── */
  const parts = [intro, body + decisionLine + continuityLine + momentumLine, closing]
    .filter(Boolean)
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return parts;
}
