/**
 * models/tenancy/NovaOperatorScope.ts
 *
 * Defines what a specific operator can see and do within the system.
 * Supports three access levels:
 *   - platform owner: isPlatformOwner=true, no tenantId restriction
 *   - tenant operator: restricted to single tenantId, optionally to specific portfolios
 *   - portfolio operator: restricted to tenantId + allowedPortfolioKeys subset
 *
 * One operator can have multiple scope records (e.g., observer on tenant A,
 * board_operator on tenant B). The platform owner has a single catch-all record.
 *
 * scopeKey: "scope::{operatorId}::{tenantId}"
 *   Platform owner scope: "scope::{operatorId}::platform"
 *
 * Indexes:
 *   (operatorId, tenantId) — primary lookup on every request
 *   (tenantId, role)       — list operators for a tenant (admin panel)
 */
import mongoose, { Document, Model, Schema } from 'mongoose';
import type { NovaOperatorRole } from '@/lib/auth/permissions';

export interface NovaOperatorScopeDocument extends Document {
  scopeKey:             string;
  operatorId:           string;
  role:                 NovaOperatorRole;
  tenantId:             string;            // 'platform' for owner with global access
  allowedPortfolioKeys: string[];          // empty = all portfolios in the tenant
  isPlatformOwner:      boolean;
  permissions:          string[];          // extra/custom permissions beyond role defaults
  createdAt:            Date;
  updatedAt:            Date;
}

const NovaOperatorScopeSchema = new Schema<NovaOperatorScopeDocument>(
  {
    scopeKey:             { type: String, required: true, unique: true, index: true },
    operatorId:           { type: String, required: true, index: true },
    role:                 { type: String, enum: ['owner','executive_operator','board_operator','risk_analyst','observer'], required: true },
    tenantId:             { type: String, required: true, index: true },
    allowedPortfolioKeys: { type: [String], default: [] },
    isPlatformOwner:      { type: Boolean, default: false },
    permissions:          { type: [String], default: [] },
  },
  { timestamps: true }
);

NovaOperatorScopeSchema.index({ operatorId: 1, tenantId: 1 });
NovaOperatorScopeSchema.index({ tenantId: 1, role: 1 });

export const NovaOperatorScope: Model<NovaOperatorScopeDocument> =
  (mongoose.models.NovaOperatorScope as Model<NovaOperatorScopeDocument>) ||
  mongoose.model<NovaOperatorScopeDocument>('NovaOperatorScope', NovaOperatorScopeSchema);
