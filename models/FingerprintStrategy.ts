// models/FingerprintStrategy.ts
import mongoose, { Schema, InferSchemaType } from "mongoose";

const VariantSchema = new Schema(
  {
    variantKey: { type: String, required: true },
    actionBias: { type: Schema.Types.Mixed, default: {} },
    explorationMultiplier: { type: Number, default: 1 },
    inheritedFrom: { type: String, default: null },
    mutationReason: { type: [String], default: [] },

    pulls: { type: Number, default: 0 },
    totalReward: { type: Number, default: 0 },
    avgReward: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["active", "promoted", "watchlist", "deprecated", "mutating"],
      default: "active",
      index: true,
    },

    lastUsedAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const FingerprintStrategySchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    fingerprint: { type: String, required: true, index: true },

    baseStrategyBias: { type: String, default: "stabilization" },
    baselineActionBias: { type: Schema.Types.Mixed, default: {} },
    baselineExplorationMultiplier: { type: Number, default: 1 },

    status: {
      type: String,
      enum: ["active", "promoted", "watchlist", "deprecated"],
      default: "active",
      index: true,
    },

    pulls: { type: Number, default: 0 },
    totalReward: { type: Number, default: 0 },
    avgReward: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },

    variants: { type: [VariantSchema], default: [] },

    lastMutationAt: { type: Date },
    lastPromotedAt: { type: Date },
    lastDeprecatedAt: { type: Date },
  },
  { timestamps: true }
);

FingerprintStrategySchema.index({ tenantId: 1, fingerprint: 1 }, { unique: true });

export type FingerprintStrategyDoc = InferSchemaType<typeof FingerprintStrategySchema>;

if (process.env.NODE_ENV !== 'production') {
  delete mongoose.models.FingerprintStrategy;
}

export const FingerprintStrategy =
  mongoose.models.FingerprintStrategy ||
  mongoose.model("FingerprintStrategy", FingerprintStrategySchema);
