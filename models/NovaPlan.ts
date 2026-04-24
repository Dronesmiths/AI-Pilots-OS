// models/NovaPlan.ts
import mongoose, { Schema, InferSchemaType } from "mongoose";

const NovaPlanStepSchema = new Schema(
  {
    stepId: { type: String, required: true },
    action: { type: String, required: true }, // boost | rebuild | reinforce | expand | internal_links | wait
    expectedReward: { type: Number, default: 0 },
    reason: { type: [String], default: [] },

    status: {
      type: String,
      enum: ["pending", "completed", "failed", "skipped"],
      default: "pending",
      index: true,
    },

    executedAt: { type: Date },
    completedAt: { type: Date },

    baselineSnapshot: {
      position: { type: Number, default: 100 },
      impressions: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      ctr: { type: Number, default: 0 },
      stuckCycles: { type: Number, default: 0 },
      status: { type: String, default: "" },
    },

    outcomeSnapshot: {
      position: { type: Number },
      impressions: { type: Number },
      clicks: { type: Number },
      ctr: { type: Number },
      stuckCycles: { type: Number },
      status: { type: String },
      reward: { type: Number, default: 0 },
    },

    constitutionApproved: { type: Boolean, default: false },
    constitutionViolations: { type: [Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const NovaPlanSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    clusterId: { type: String, required: true, index: true },
    keyword: { type: String, index: true },
    fingerprint: { type: String, index: true },

    objective: { type: String, required: true }, // reach_top_10 | recover_drop | improve_ctr | clear_stuck_state
    planMode: {
      type: String,
      enum: ["simple", "advanced"],
      default: "advanced",
      index: true,
    },

    sequenceKey: { type: String, index: true }, // reinforce>wait>boost
    steps: { type: [NovaPlanStepSchema], default: [] },
    currentStepIndex: { type: Number, default: 0 },

    confidence: { type: Number, default: 0.5 },
    projectedReward: { type: Number, default: 0 },

    strategyMode: { type: String, default: "stabilization" },
    banditContextKey: { type: String, default: null },

    status: {
      type: String,
      enum: ["active", "completed", "abandoned", "failed"],
      default: "active",
      index: true,
    },

    replanCount: { type: Number, default: 0 },
    lastEvaluatedAt: { type: Date, default: Date.now },
    nextEligibleExecutionAt: { type: Date, default: Date.now },

    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// Compound active index mapping accurately securely physically optimizing lookup paths
NovaPlanSchema.index(
  { tenantId: 1, clusterId: 1, status: 1 },
  { partialFilterExpression: { status: "active" } }
);

export type NovaPlanDoc = InferSchemaType<typeof NovaPlanSchema>;

if (process.env.NODE_ENV !== "production") {
  delete mongoose.models.NovaPlan;
}

export const NovaPlan =
  mongoose.models.NovaPlan || mongoose.model("NovaPlan", NovaPlanSchema);
