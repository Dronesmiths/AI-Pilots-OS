import mongoose, { Schema } from 'mongoose';

/**
 * AgentDecision
 * ─────────────
 * Stores the structured strategic decision captured from an
 * agent voice call (Brian / operator). Nova reads this when
 * composing client-facing briefings so the client hears unified
 * direction — not internal mechanics.
 *
 * Decision types:
 *   expand_cluster    — build more pages in same keyword family
 *   switch_blog       — pivot to blog/long-form content
 *   pause             — hold all autonomous actions
 *   run_campaign      — trigger follow-up campaign
 *   custom            — catch-all for anything freeform
 */
const AgentDecisionSchema = new Schema(
  {
    tenantId:     { type: String, required: true, index: true },
    decisionType: {
      type: String,
      enum: ['expand_cluster', 'switch_blog', 'pause', 'run_campaign', 'custom'],
      default: 'custom',
    },
    // Rich metadata: count, keywords, strategy notes
    metadata:     { type: Schema.Types.Mixed, default: {} },
    // Source of the decision
    source:       { type: String, default: 'voice_agent' },
    callId:       { type: String },
    // The raw agent message for audit
    rawIntent:    { type: String },
    confidence:   { type: Number, default: 0 },
    // Whether this decision has been acted upon
    acted:        { type: Boolean, default: false },
    actedAt:      { type: Date },
  },
  { timestamps: true }
);

// Only keep one "latest" decision per tenant in the active window
AgentDecisionSchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.models.AgentDecision ||
  mongoose.model('AgentDecision', AgentDecisionSchema);
