/**
 * brandVoice.ts
 * ─────────────
 * Tone profiles for four brand archetypes.
 * Each profile controls: intros, body style, closing energy, Vapi voice ID.
 *
 * Add more profiles by extending BRAND_PROFILES.
 */

export type BrandVoiceType = 'contractor' | 'professional' | 'startup' | 'ministry';

export type ToneProfile = {
  intros:       string[];
  closings:     string[];
  bodyStyle:    'direct' | 'formal' | 'energetic' | 'warm';
  vapiVoiceId:  string;   // OpenAI voice ID used in Vapi
};

export const BRAND_PROFILES: Record<BrandVoiceType, ToneProfile> = {

  contractor: {
    intros:  [
      'Quick update —',
      'Hey — quick update.',
      'Hey — just a quick one.',
    ],
    closings: [
      "We're on it.",
      'Progress is solid.',
      "We're building steadily.",
    ],
    bodyStyle:   'direct',
    vapiVoiceId: 'onyx',   // OpenAI — deeper, confident
  },

  professional: {
    intros: [
      'Just a quick update.',
      'Wanted to share a brief progress note.',
      'A quick update for you.',
    ],
    closings: [
      'Everything is progressing well.',
      'Things are on track.',
      'We continue to move forward.',
    ],
    bodyStyle:   'formal',
    vapiVoiceId: 'nova',   // OpenAI — calm, polished
  },

  startup: {
    intros: [
      'Quick win —',
      'Big update —',
      'Hey — things are moving.',
    ],
    closings: [
      "Momentum is building nicely.",
      "We're seeing good traction.",
      "Things are looking great.",
    ],
    bodyStyle:   'energetic',
    vapiVoiceId: 'shimmer',  // OpenAI — upbeat
  },

  ministry: {
    intros: [
      'Hey — just wanted to share something.',
      'Quick update for you.',
      'Hey — sharing a little good news.',
    ],
    closings: [
      'Things are moving forward in a really positive way.',
      "We're encouraged by the progress.",
      'It\'s all heading in the right direction.',
    ],
    bodyStyle:   'warm',
    vapiVoiceId: 'nova',   // OpenAI — warm, trustworthy
  },
};

/**
 * Returns the tone profile for a given brand type, defaulting to 'professional'.
 */
export function getToneProfile(type?: string): ToneProfile {
  return BRAND_PROFILES[(type as BrandVoiceType) ?? 'professional'] ?? BRAND_PROFILES.professional;
}

/**
 * Build the body sentence for the given style + event + momentum state.
 */
export function buildBodyForStyle(
  style: ToneProfile['bodyStyle'],
  eventType: string,
  momentumState?: string
): string {
  const isMomentum = momentumState && momentumState !== 'early';

  const BODIES: Record<ToneProfile['bodyStyle'], Record<string, string>> = {
    direct: {
      page_published: isMomentum
        ? 'We added new pages to help your business show up locally. We\'re continuing to build on that.'
        : 'We added new pages to help your business show up locally.',
      summary: 'We\'re actively working on your site and making progress.',
      _default: 'Work is underway and things are on track.',
    },
    formal: {
      page_published: isMomentum
        ? 'We\'ve added new content to strengthen your online visibility and are continuing to expand strategically.'
        : 'We\'ve added new content to strengthen your online visibility.',
      summary: 'Activity on your site remains consistent and progress is steady.',
      _default: 'Work continues to advance as planned.',
    },
    energetic: {
      page_published: isMomentum
        ? 'We just pushed new content live and we\'re building on that momentum.'
        : 'We just pushed new content live.',
      summary: 'We\'ve been active on your site and things are picking up.',
      _default: 'Things are moving and momentum is building.',
    },
    warm: {
      page_published: isMomentum
        ? 'We\'ve added new content to help more people connect with you, and we\'re continuing to grow from there.'
        : 'We\'ve added new content to help more people discover what you\'re doing.',
      summary: 'We\'ve been working steadily to help more people find and connect with your community.',
      _default: 'Things are moving forward and we\'re encouraged by the progress.',
    },
  };

  return BODIES[style][eventType] ?? BODIES[style]._default;
}
