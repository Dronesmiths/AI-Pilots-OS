/**
 * models/enterprise/NovaVenture.ts
 *
 * A persisted venture — a business asset that Nova has identified, validated,
 * built, or is actively growing. Ventures are created from high-scoring opportunities.
 *
 * status lifecycle:
 *   idea → validating → building → live → scaling → killed
 *
 * Constitutional guardrail fields:
 *   requiresApproval: true if the venture hit a cost or domain guardrail
 *   approvedBy:       operatorId who explicitly approved (required before 'building')
 *   approvedAt:       timestamp of approval
 *   blockedReason:    why it was blocked (for audit)
 *
 * assets: filled in after the build phase completes
 * metrics: updated on each evaluation cycle
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type VentureStatus = 'idea' | 'validating' | 'building' | 'live' | 'scaling' | 'killed';
export type VentureOrigin = 'autonomous' | 'operator' | 'doctrine' | 'pattern';

export interface NovaVentureDocument extends Document {
  ventureKey:        string;
  name:              string;
  description?:      string;
  domain:            string;
  origin:            VentureOrigin;
  opportunityRef?:   string;
  status:            VentureStatus;
  confidence:        number;
  validationScore?:  number;
  roi?:              number;
  metrics?: {
    traffic?:    number;
    leads?:      number;
    revenue?:    number;
    cost?:       number;
  };
  assets?: {
    siteUrl?:  string;
    repoUrl?:  string;
    agentId?:  string;
  };
  // Constitutional guardrail fields
  requiresApproval: boolean;
  approvedBy?:      string;
  approvedAt?:      Date;
  blockedReason?:   string;
  missionKeys:      string[];
  metadata?:        Record<string, unknown>;
  createdAt:        Date;
  updatedAt:        Date;
}

const NovaVentureSchema = new Schema<NovaVentureDocument>(
  {
    ventureKey:       { type: String, required: true, unique: true, index: true },
    name:             { type: String, required: true },
    description:      String,
    domain:           { type: String, required: true, index: true },
    origin:           { type: String, enum: ['autonomous','operator','doctrine','pattern'], default: 'autonomous' },
    opportunityRef:   { type: String, index: true },
    status:           { type: String, enum: ['idea','validating','building','live','scaling','killed'], default: 'idea', index: true },
    confidence:       { type: Number, default: 0.5 },
    validationScore:  Number,
    roi:              Number,
    metrics: {
      traffic:  Number,
      leads:    Number,
      revenue:  Number,
      cost:     Number,
    },
    assets: {
      siteUrl:  String,
      repoUrl:  String,
      agentId:  String,
    },
    // Constitutional guardrail
    requiresApproval: { type: Boolean, default: false, index: true },
    approvedBy:       String,
    approvedAt:       Date,
    blockedReason:    String,
    missionKeys:      [String],
    metadata:         { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Dashboard sort: live ventures first
NovaVentureSchema.index({ status: 1, roi: -1, createdAt: -1 });

export const NovaVenture: Model<NovaVentureDocument> =
  (mongoose.models.NovaVenture as Model<NovaVentureDocument>) ||
  mongoose.model<NovaVentureDocument>('NovaVenture', NovaVentureSchema);
