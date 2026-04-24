/**
 * models/boardroom/NovaStrategicResolution.ts
 *
 * A board-level strategic proposal that moves through a voting lifecycle.
 *
 * status lifecycle:
 *   proposed → voting → approved | rejected → applied
 *
 * The simulation field in metadata is populated by runCapitalSimulation
 * before the resolution is persisted to the DB, giving voters full context.
 *
 * resolutionKey: deterministic "{portfolio}::{recommendedAction}::{category}::{YYYY-MM-DD}"
 *   One proposal per action type per category per portfolio per day.
 *   Same-day cognition loop re-runs upsert, not duplicate.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type ResolutionCategory      = 'capital' | 'venture' | 'org' | 'doctrine' | 'autonomy';
export type ResolutionAction        = 'scale' | 'decrease' | 'hold' | 'merge' | 'exit' | 'approve' | 'pause';
export type ResolutionStatus        = 'proposed' | 'voting' | 'approved' | 'rejected' | 'applied';

export interface NovaStrategicResolutionDocument extends Document {
  resolutionKey:      string;
  portfolioKey?:      string;
  title:              string;
  category:           ResolutionCategory;
  proposal:           string;
  recommendedAction:  ResolutionAction;
  status:             ResolutionStatus;
  confidence:         number;
  impactScore:        number;
  precedentWarning?:  string;  // set if historical success rate is low
  metadata?:          Record<string, unknown>;
  createdAt:          Date;
  updatedAt:          Date;
}

const NovaStrategicResolutionSchema = new Schema<NovaStrategicResolutionDocument>(
  {
    resolutionKey:     { type: String, required: true, unique: true, index: true },
    portfolioKey:      { type: String, index: true },
    title:             { type: String, required: true },
    category:          { type: String, enum: ['capital','venture','org','doctrine','autonomy'], required: true, index: true },
    proposal:          { type: String, required: true },
    recommendedAction: { type: String, enum: ['scale','decrease','hold','merge','exit','approve','pause'], required: true, index: true },
    status:            { type: String, enum: ['proposed','voting','approved','rejected','applied'], default: 'proposed', index: true },
    confidence:        { type: Number, default: 0.5 },
    impactScore:       { type: Number, default: 0.5 },
    precedentWarning:  String,
    metadata:          { type: Schema.Types.Mixed },
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

// Dashboard: pending resolutions sorted by impact
NovaStrategicResolutionSchema.index({ status: 1, impactScore: -1, createdAt: -1 });

export const NovaStrategicResolution: Model<NovaStrategicResolutionDocument> =
  (mongoose.models.NovaStrategicResolution as Model<NovaStrategicResolutionDocument>) ||
  mongoose.model<NovaStrategicResolutionDocument>('NovaStrategicResolution', NovaStrategicResolutionSchema);
