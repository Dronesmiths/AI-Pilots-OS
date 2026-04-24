// models/NovaOutcome.ts
import mongoose, { Schema, Document } from "mongoose";

export interface INovaOutcome extends Document {
  tenantId: string;
  clusterId?: string;
  keyword?: string;

  action: string; // rebuild | boost | reinforce | etc
  scoreAtExecution?: number;

  positionBefore?: number;
  positionAfter?: number;

  impressionsBefore?: number;
  impressionsAfter?: number;

  clicksBefore?: number;
  clicksAfter?: number;

  ctrBefore?: number;
  ctrAfter?: number;

  deltaPosition?: number;
  deltaClicks?: number;
  deltaImpressions?: number;

  bandit?: {
    contextKey: string;
    selectedArm: string;
    policy: string;
    explore: boolean;
    avgRewardAtDecision: number;
    pullsAtDecision: number;
  };

  success: boolean;
  createdAt: Date;
}

const NovaOutcomeSchema: Schema = new Schema({
  tenantId: { type: String, required: true },
  clusterId: { type: String, required: false },
  keyword: { type: String, required: false },

  action: { type: String, required: true },
  scoreAtExecution: { type: Number, required: false },

  positionBefore: { type: Number, required: false },
  positionAfter: { type: Number, required: false },

  impressionsBefore: { type: Number, required: false },
  impressionsAfter: { type: Number, required: false },

  clicksBefore: { type: Number, required: false },
  clicksAfter: { type: Number, required: false },

  ctrBefore: { type: Number, required: false },
  ctrAfter: { type: Number, required: false },

  deltaPosition: { type: Number, required: false },
  deltaClicks: { type: Number, required: false },
  deltaImpressions: { type: Number, required: false },

  bandit: {
    contextKey: { type: String, required: false },
    selectedArm: { type: String, required: false },
    policy: { type: String, required: false },
    explore: { type: Boolean, required: false },
    avgRewardAtDecision: { type: Number, required: false },
    pullsAtDecision: { type: Number, required: false },
  },

  success: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }
});

if (process.env.NODE_ENV !== 'production') {
  delete mongoose.models.NovaOutcome;
}

export default mongoose.models.NovaOutcome || mongoose.model<INovaOutcome>("NovaOutcome", NovaOutcomeSchema);
