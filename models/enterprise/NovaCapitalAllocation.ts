/**
 * models/enterprise/NovaCapitalAllocation.ts
 *
 * One allocation record per venture per rebalance cycle.
 * Tracks what resources were assigned, by what rationale, and current status.
 *
 * allocationType covers the 5 resource dimensions:
 *   capital          → dollar budget
 *   compute          → CPU/GPU time
 *   mission_budget   → how many missions can be launched
 *   agent_capacity   → how many AI agents assigned
 *   operator_attention → how much human time priority
 *
 * allocationKey: deterministic per portfolio+venture+type+day to enable upsert.
 *   Multiple rebalances per day update instead of duplicate.
 *
 * Compound index (portfolioKey, ventureKey, status) serves the
 * "get active allocations for a portfolio" query in the API.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type AllocationType = 'capital' | 'compute' | 'mission_budget' | 'agent_capacity' | 'operator_attention';
export type AllocationStatus = 'active' | 'reduced' | 'removed';

export interface NovaCapitalAllocationDocument extends Document {
  allocationKey:   string;
  portfolioKey:    string;
  ventureKey:      string;
  allocationType:  AllocationType;
  allocatedAmount: number;
  rationale:       string;
  confidence:      number;
  status:          AllocationStatus;
  metadata?:       Record<string, unknown>;
  createdAt:       Date;
  updatedAt:       Date;
}

const NovaCapitalAllocationSchema = new Schema<NovaCapitalAllocationDocument>(
  {
    allocationKey:   { type: String, required: true, unique: true, index: true },
    portfolioKey:    { type: String, required: true, index: true },
    ventureKey:      { type: String, required: true, index: true },
    allocationType:  { type: String, enum: ['capital','compute','mission_budget','agent_capacity','operator_attention'], required: true, index: true },
    allocatedAmount: { type: Number, default: 0 },
    rationale:       { type: String, required: true },
    confidence:      { type: Number, default: 0.5 },
    status:          { type: String, enum: ['active','reduced','removed'], default: 'active', index: true },
    metadata:        { type: Schema.Types.Mixed },
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

NovaCapitalAllocationSchema.index({ portfolioKey: 1, ventureKey: 1, status: 1 });
NovaCapitalAllocationSchema.index({ portfolioKey: 1, allocationType: 1, status: 1 });

export const NovaCapitalAllocation: Model<NovaCapitalAllocationDocument> =
  (mongoose.models.NovaCapitalAllocation as Model<NovaCapitalAllocationDocument>) ||
  mongoose.model<NovaCapitalAllocationDocument>('NovaCapitalAllocation', NovaCapitalAllocationSchema);
