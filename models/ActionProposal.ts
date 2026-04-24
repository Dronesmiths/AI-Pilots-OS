import mongoose, { Schema, InferSchemaType } from 'mongoose';

const ActionProposalSchema = new Schema(
  {
    tenantId:    { type: String, required: true, index: true },
    insightId:   { type: String, required: true },

    type: {
      type: String,
      enum: ['create_page', 'update_script', 'followup_campaign'],
      required: true,
    },

    title:       { type: String, required: true },
    description: { type: String, required: true },

    payload:     { type: Schema.Types.Mixed, default: {} },

    status: {
      type: String,
      enum: ['pending', 'approved', 'executing', 'completed', 'rejected', 'failed'],
      default: 'pending',
      index: true,
    },

    confidence:  { type: Number, default: 0 },

    // ── Trust evaluation (written by evaluateActionTrust) ──────────
    riskLevel:           { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    trustScore:          { type: Number, default: 0 },   // 0–100
    autoEligible:        { type: Boolean, default: false },
    autoExecute:         { type: Boolean, default: false },
    autoExecuted:        { type: Boolean, default: false },
    reviewRequired:      { type: Boolean, default: true },
    autoExecutionReasons: [{ type: String }],

    // Result written by the executor
    result:        { type: Schema.Types.Mixed },
    failureReason: { type: String },
    executedAt:    { type: Date },
    approvedAt:    { type: Date },
    rejectedAt:    { type: Date },
    approvedBy:    { type: String },
  },
  { timestamps: true }
);

ActionProposalSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export type ActionProposal = InferSchemaType<typeof ActionProposalSchema>;

export default mongoose.models.ActionProposal ||
  mongoose.model('ActionProposal', ActionProposalSchema);
