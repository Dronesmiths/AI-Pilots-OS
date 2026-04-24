// models/NovaGoal.ts
import mongoose, { Schema, InferSchemaType } from "mongoose";

const NovaGoalSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },

    type: {
      type: String,
      enum: [
        "rank_improvement",
        "traffic_growth",
        "lead_generation",
        "cluster_expansion",
        "authority_building",
        "recovery"
      ],
      required: true,
    },

    title: { type: String, required: true },

    target: {
      metric: { type: String, enum: ["position", "clicks", "ctr", "coverage"] },
      value: { type: Number, default: 0 },
    },

    scope: {
      clusterIds: { type: [String], default: [] },
      keywords: { type: [String], default: [] },
    },

    priority: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    revenueWeight: { type: Number, default: 1.0 },

    status: {
      type: String,
      enum: ["active", "completed", "failed", "paused"],
      default: "active",
      index: true,
    },
    
    progressPct: { type: Number, default: 0 },

  },
  { timestamps: true }
);

// Optimize fast lookup for active tenant mission structures
NovaGoalSchema.index(
  { tenantId: 1, status: 1 },
  { partialFilterExpression: { status: "active" } }
);

export type NovaGoalDoc = InferSchemaType<typeof NovaGoalSchema>;

if (process.env.NODE_ENV !== "production") {
  delete mongoose.models.NovaGoal;
}

export const NovaGoal =
  mongoose.models.NovaGoal || mongoose.model("NovaGoal", NovaGoalSchema);
