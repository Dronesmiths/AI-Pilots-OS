/**
 * buildClientMessage.ts
 * ─────────────────────
 * Generates the client-facing voice briefing based on:
 *   - What just happened (event context)
 *   - What the agent decided (decision context)
 *
 * Rules:
 *   ✅ "we" language — unified system voice
 *   ✅ Under 15 seconds spoken (~30 words)
 *   ✅ Positive, directional, confident
 *   ❌ Never mention agent, Brian, or internal decisions
 *   ❌ Never use technical terms (SEO, drone, pipeline, keyword)
 *   ❌ Never expose strategy or decision source
 */

export type ClientMessageContext = {
  targetDomain:    string;
  keyword?:        string;
  eventType:       string;   // 'page_published' | 'insight' | 'action_completed'
  decisionType?:   string;   // from AgentDecision.decisionType
  decisionMeta?:   Record<string, any>;
};

const MESSAGES: Record<string, (ctx: ClientMessageContext) => string> = {

  expand_cluster: ({ targetDomain }) =>
    `Hey — quick update for ${targetDomain || 'your site'}. ` +
    `We just added new content to help your business show up in search, ` +
    `and we're continuing to expand with additional pages to build momentum. ` +
    `Everything is moving in the right direction.`,

  switch_blog: ({ targetDomain }) =>
    `Hey — quick update for ${targetDomain || 'your site'}. ` +
    `We've added new content to your website and are expanding into broader topics ` +
    `to help more people find your business online. Things are progressing well.`,

  run_campaign: ({ targetDomain }) =>
    `Hey — quick update for ${targetDomain || 'your site'}. ` +
    `We're following up with people who've shown interest in your services. ` +
    `This is designed to bring more business back to you.`,

  pause: ({ targetDomain }) =>
    `Hey — quick update for ${targetDomain || 'your site'}. ` +
    `We've been reviewing recent progress and things are on track. ` +
    `We'll continue monitoring and be in touch with the next update soon.`,

  // Default — no agent decision yet or decision is 'custom'
  _default: ({ targetDomain }) =>
    `Hey — quick update for ${targetDomain || 'your site'}. ` +
    `We just added new content to help your business show up when people search in your area. ` +
    `Everything is moving in the right direction.`,
};

/**
 * Returns the client-facing spoken message.
 */
export function buildClientMessage(ctx: ClientMessageContext): string {
  const builder = (ctx.decisionType && MESSAGES[ctx.decisionType])
    ? MESSAGES[ctx.decisionType]
    : MESSAGES._default;
  return builder(ctx).trim();
}

/**
 * Maps a voice call intent to a structured decision type.
 */
export function intentToDecisionType(intent: string): string {
  const MAP: Record<string, string> = {
    approve_more_pages: 'expand_cluster',
    hold:               'pause',
    reject:             'pause',
  };
  return MAP[intent] ?? 'custom';
}
