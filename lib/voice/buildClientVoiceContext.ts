import mongoose           from 'mongoose';
import connectToDatabase  from '@/lib/mongodb';

/**
 * buildClientVoiceContext
 * ────────────────────────
 * Aggregates recent CRM activity for a tenant and returns a
 * plain-English context block the Vapi assistant injects at
 * call start.
 *
 * All data is read-only. Nothing is written here.
 */
export async function buildClientVoiceContext(tenantId: string): Promise<string> {
  await connectToDatabase();
  const db = mongoose.connection.db!;

  /* ── Recent actions (last 14 days) ───────────────────────────── */
  const recentActions = await db.collection('actionproposals')
    .find({ tenantId, status: 'completed', createdAt: { $gte: new Date(Date.now() - 14 * 86_400_000) } })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();

  /* ── Recent call decisions ────────────────────────────────────── */
  const recentDecisions = await db.collection('activitylogs')
    .find({ userId: tenantId, type: { $in: ['ACTION_QUEUED', 'CLIENT_BRIEFING_PLACED'] } })
    .sort({ timestamp: -1 })
    .limit(5)
    .toArray();

  /* ── Page count (all time) ────────────────────────────────────── */
  const pageCount = await db.collection('actionproposals').countDocuments({
    tenantId, type: 'create_page', status: 'completed',
  });

  /* ── Latest agent decision ────────────────────────────────────── */
  const latestDecision = await db.collection('agentdecisions')
    .findOne({ tenantId }, { sort: { createdAt: -1 } });

  /* ── Build plan section ───────────────────────────────────────── */
  const actionSummary = recentActions.length > 0
    ? recentActions.map(a =>
        `- ${humanizeAction(a.type, a.title)}`
      ).join('\n')
    : '- No completed actions yet recorded in the last 14 days.';

  const nextStepHint = latestDecision?.decisionType === 'expand_cluster'
    ? 'The current plan is to continue expanding visibility with more targeted content.'
    : latestDecision?.decisionType === 'switch_blog'
    ? 'The focus is shifting to broader topics to reach more people.'
    : latestDecision?.decisionType === 'pause'
    ? 'The team is currently reviewing progress before the next phase.'
    : 'Work is ongoing — the team is actively building and improving the site.';

  return `
CURRENT CONTEXT FOR THIS CLIENT:

Total pages published to date: ${pageCount}
Recent activity (last 14 days):
${actionSummary}

Current direction:
${nextStepHint}

IMPORTANT ANSWERING RULES:
- Speak in plain, non-technical language
- Describe actions as outcomes: "we added content to help more people find your business"
- Never say: SEO, keyword, drone, pipeline, Nova, API, CRM, schema
- Always speak as "we" (unified service team)
- When asked what's next: be reassuring and directional, not specific about technical steps
- If you don't have specific data, say: "The team is actively working on improvements and I'll have more to share soon"
- Maximum answer length: 3 sentences
  `.trim();
}

function humanizeAction(type: string, title: string): string {
  if (type === 'create_page')      return 'Added new content to help your business appear in more searches';
  if (type === 'followup_campaign') return 'Set up follow-up outreach to interested prospects';
  if (type === 'update_script')    return 'Improved how your phone agent responds to callers';
  return title ?? 'Completed a site improvement';
}
