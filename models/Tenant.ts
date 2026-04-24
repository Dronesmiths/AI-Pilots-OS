/**
 * models/Tenant.ts
 *
 * The primary identity record for every tenant in the AI Pilots OS.
 * Created once during activation and never replaced — upsert-safe.
 *
 * tenantId: human-readable slug derived from domain or name
 *   (e.g. "urban-design-remodel", NOT a Mongo ObjectId)
 *   This makes it readable in logs, URLs, and event payloads.
 *
 * All downstream collections (EngineState, QueueJob, DashboardClientState,
 * SeoGoal, etc.) reference this tenantId as a string.
 */
import mongoose, { Schema, InferSchemaType, Model } from 'mongoose';

const TenantSchema = new Schema(
  {
    tenantId:   { type: String, required: true, unique: true, index: true },
    name:       { type: String, default: '' },
    domain:     { type: String, required: true, unique: true, index: true },
    repoUrl:    { type: String, default: '' },
    gscSiteUrl: { type: String, default: '' },
    // Multi-agency hierarchy
    agencyId:   { type: String, default: null, index: true },  // null = platform-direct tenant
    // Onboarding fields
     industry:   { type: String, default: '' },
    plan:       { type: String, enum: ['starter','growth','pro'], default: 'starter', index: true },
    goal:       { type: String, enum: ['grow_traffic','increase_conversions','stabilize','experiment'], default: 'grow_traffic' },
    onboarded:  { type: Boolean, default: false, index: true },
    isDemo:     { type: Boolean, default: false, index: true },
    expiresAt:  { type: Date },
    status: {
      type:    String,
      enum:    ['active', 'inactive', 'error'],
      default: 'active',
      index:   true,
    },
  },
  { timestamps: true }
);

export type TenantDocument = InferSchemaType<typeof TenantSchema>;

const Tenant: Model<TenantDocument> =
  mongoose.models.Tenant || mongoose.model('Tenant', TenantSchema);

export default Tenant;
