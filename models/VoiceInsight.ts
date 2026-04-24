import mongoose, { Schema, InferSchemaType } from 'mongoose';

const VoiceInsightSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    type: {
      type: String,
      enum: [
        'missed_opportunity',
        'faq_gap',
        'conversion_signal',
        'negative_pattern',
        'high_intent_cluster',
      ],
      required: true,
    },

    title:       { type: String, required: true },
    description: { type: String, required: true },

    supportingCallIds: [{ type: String }],

    confidence: { type: Number, default: 0 },

    recommendedAction: {
      type: String,
      enum: [
        'create_page',
        'update_script',
        'add_faq',
        'followup_campaign',
        'no_action',
      ],
      default: 'no_action',
    },

    // Whether an operator has reviewed this insight yet
    reviewed:   { type: Boolean, default: false },
    reviewedAt: { type: Date },

    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

VoiceInsightSchema.index({ tenantId: 1, createdAt: -1 });
VoiceInsightSchema.index({ tenantId: 1, type: 1, reviewed: 1 });

export type VoiceInsight = InferSchemaType<typeof VoiceInsightSchema>;

export default mongoose.models.VoiceInsight ||
  mongoose.model('VoiceInsight', VoiceInsightSchema);
