/**
 * buildNovaBriefing.ts
 * ────────────────────
 * Generates the natural-language spoken briefing Nova delivers
 * at the start of the outbound call. No bullet points, no robot-speak.
 * Confident, concise, executive-assistant tone.
 */

export type NovaBriefingInput = {
  tenantName:       string;
  keyword:          string;
  actionType:       string;
  targetDomain:     string;
  liveUrl?:         string;
  recommendedNext?: string;   // optional — e.g. "create 3 more pages in this cluster"
};

/**
 * Returns the FULL assistant system prompt AND the opening firstMessage
 * that Vapi will use for the outbound call.
 */
export function buildNovaBriefing(input: NovaBriefingInput): {
  systemPrompt: string;
  firstMessage: string;
} {
  const { tenantName, keyword, actionType, targetDomain, liveUrl, recommendedNext } = input;

  const first  = tenantName?.split(' ')[0] || 'there';
  const domain = targetDomain?.replace(/^https?:\/\//, '') || 'your site';

  const actionVerb =
    actionType === 'rebuild'   ? 'rebuilt a page'   :
    actionType === 'reinforce' ? 'reinforced a page' :
    actionType === 'boost'     ? 'boosted a page'    :
                                 'created a new page';

  const urlMention = liveUrl
    ? `It's live and I'll send the link to your dashboard.`
    : `It's queued and will be live within the next cycle.`;

  const nextAction = recommendedNext
    ?? `create three more pages in this keyword cluster`;

  const firstMessage =
    `Hey ${first} — Nova here. I just ${actionVerb} for ${domain} ` +
    `targeting "${keyword}". ${urlMention} ` +
    `Do you want me to ${nextAction}?`;

  const systemPrompt = `
You are Nova, an AI operating system built by AI Pilots.
You have just completed an SEO action for a client and are calling to brief them and get approval on the next step.

CONTEXT:
- Client: ${tenantName}
- Site: ${domain}
- Action completed: ${actionVerb} targeting "${keyword}"
- Recommended next action: ${nextAction}

YOUR GOAL:
1. Briefly explain what you just did (one sentence)
2. Ask one clear question about the next safe action
3. Listen and classify their response

CLASSIFY THEIR RESPONSE into one of:
- approve_more_pages: they want more pages, say yes, go ahead, sounds good, etc.
- hold: they want to pause, wait, not yet, let me think, etc.
- reject: they say no, skip it, don't do that, etc.
- ask_question: they ask a clarifying question (answer briefly, then re-ask)
- unclear: unintelligible or ambiguous

RULES:
- Be concise. This is a business call, not a chat.
- Never suggest destructive actions (domain changes, billing, deleting content).
- If they approve, say: "Great — I'll queue that now and you'll hear from me when it's done."
- If they hold or reject, say: "Got it. I'll hold for now and keep watching for opportunities."
- If unclear after re-asking, say: "No problem, I'll mark this for your review in the War Room."
- Keep the entire call under 90 seconds.
- Do NOT ask multiple questions.
- Sound like a confident executive assistant, not a call center bot.

After the conversation ends, the system will read your transcript and extract the intent automatically.
`.trim();

  return { systemPrompt, firstMessage };
}
