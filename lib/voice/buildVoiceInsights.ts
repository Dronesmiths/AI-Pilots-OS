import mongoose           from 'mongoose';
import VoiceInsightModel  from '@/models/VoiceInsight';
import type { VoiceAnalysis } from '@/lib/voice/analyzeVoicePatterns';

type InsightDraft = {
  type:              string;
  title:             string;
  description:       string;
  confidence:        number;
  recommendedAction: string;
  supportingCallIds: string[];
  metadata?:         Record<string, unknown>;
};

const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);

/**
 * buildVoiceInsights (v2)
 * ───────────────────────
 * Converts pattern metrics → VoiceInsight documents.
 * Includes 6-hour deduplication to prevent insight spam.
 * PHASE 2: RECOMMENDATION ONLY — no actions auto-executed.
 */
export async function buildVoiceInsights(
  tenantId: string,
  analysis: VoiceAnalysis
): Promise<InsightDraft[]> {
  const { metrics, calls } = analysis;
  const db = mongoose.connection.db;
  const allCallIds = calls.map((c: any) => String(c._id));
  const drafts: InsightDraft[] = [];

  /* ── Rule 1: Follow-up gap ──────────────────────────────── */
  if (metrics.followups >= 3 && ratio(metrics.followups, metrics.total) > 0.3) {
    drafts.push({
      type:              'conversion_signal',
      title:             '📲 High follow-up demand detected',
      description:       `${metrics.followups}/${metrics.total} callers requested follow-up. An automated SMS/email sequence could recover these leads before they go cold.`,
      confidence:        Math.min(0.95, 0.75 + metrics.followups * 0.04),
      recommendedAction: 'followup_campaign',
      supportingCallIds: allCallIds,
      metadata:          { followups: metrics.followups, total: metrics.total },
    });
  }

  /* ── Rule 2: Missed leads ───────────────────────────────── */
  if (metrics.missed >= 3) {
    drafts.push({
      type:              'missed_opportunity',
      title:             '⚠️ Missed lead pattern detected',
      description:       `${metrics.missed} calls failed to convert in the last 24 hours. Consider reviewing the voice script or adding a booking CTA earlier in the call.`,
      confidence:        Math.min(0.92, 0.68 + metrics.missed * 0.05),
      recommendedAction: 'update_script',
      supportingCallIds: allCallIds,
      metadata:          { missed: metrics.missed, total: metrics.total },
    });
  }

  /* ── Rule 3: Pricing intent spike ──────────────────────── */
  if (metrics.pricing >= 4) {
    drafts.push({
      type:              'faq_gap',
      title:             '💰 Pricing intent spike',
      description:       `${metrics.pricing} callers asked about pricing in the last 24 hours. Your landing page or script may lack pricing clarity — a dedicated pricing FAQ could reduce friction.`,
      confidence:        Math.min(0.94, 0.72 + metrics.pricing * 0.04),
      recommendedAction: 'create_page',
      supportingCallIds: allCallIds,
      metadata:          { pricing: metrics.pricing, topKeywords: metrics.topKeywords },
    });
  }

  /* ── Rule 4: High-intent cluster ────────────────────────── */
  if (metrics.highIntent >= 2) {
    drafts.push({
      type:              'high_intent_cluster',
      title:             '🔥 High-intent callers detected',
      description:       `${metrics.highIntent} callers signaled they are ready to book or start. Ensure the booking CTA is frictionless — these are your hottest leads right now.`,
      confidence:        0.92,
      recommendedAction: 'no_action',
      supportingCallIds: allCallIds,
      metadata:          { highIntent: metrics.highIntent },
    });
  }

  /* ── Rule 5: Objection spike ────────────────────────────── */
  if (metrics.objections >= 2 && ratio(metrics.objections, metrics.total) > 0.25) {
    drafts.push({
      type:              'negative_pattern',
      title:             '🚨 Objection pattern rising',
      description:       `${metrics.objections} callers raised price or timing objections. Consider adding a value-reinforcement section to the script.`,
      confidence:        0.82,
      recommendedAction: 'update_script',
      supportingCallIds: allCallIds,
      metadata:          { objections: metrics.objections, total: metrics.total },
    });
  }

  /* ── Dedupe + persist ───────────────────────────────────── */
  const dedupeWindow = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const created: InsightDraft[] = [];

  for (const draft of drafts) {
    const existing = await VoiceInsightModel.findOne({
      tenantId,
      type: draft.type,
      createdAt: { $gte: dedupeWindow },
    });

    if (!existing) {
      await VoiceInsightModel.create({ tenantId, ...draft });
      created.push(draft);
    }
  }

  /* ── Emit NOVA_INSIGHT activity events ─────────────────── */
  if (db && created.length > 0) {
    await db.collection('activityLogs').insertMany(
      created.map(d => ({
        userId:    tenantId,
        type:      'NOVA_INSIGHT',
        message:   `🧠 ${d.title}`,
        level:     d.type === 'negative_pattern' || d.type === 'missed_opportunity' ? 'warning' : 'info',
        metadata:  { insightType: d.type, recommendedAction: d.recommendedAction, confidence: d.confidence },
        timestamp: new Date().toISOString(),
      }))
    );
  }

  return created;
}
