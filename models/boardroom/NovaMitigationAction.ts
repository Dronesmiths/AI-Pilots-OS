/**
 * models/boardroom/NovaMitigationAction.ts
 *
 * Immutable audit log of every self-healing action Nova takes or proposes.
 * Every corrective action — applied, skipped, failed, or reverted — is recorded here.
 *
 * mitigationKey: deterministic "mitigation::{anomalyKey}::{actionType}"
 *   One record per anomaly per action type — prevents duplicate mitigations.
 *
 * rollbackMetadata: stores pre-mitigation state needed to undo the action.
 *   Only meaningful when rollbackAvailable=true.
 *   The revertMitigationAction function uses these values to reverse changes.
 *
 * status lifecycle:
 *   proposed → applied | skipped | failed
 *   applied  → reverted
 *
 * Nova NEVER: deletes records, raises exposure, overrides doctrine.
 * Nova MAY:   reduce, pause, freeze, downgrade, reopen.
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export type MitigationActionType =
  | 'reduce_exposure'
  | 'pause_execution'
  | 'downgrade_autonomy'
  | 'block_auto_approvals'
  | 'reopen_monitoring'
  | 'freeze_domain';

export type MitigationStatus = 'proposed' | 'applied' | 'skipped' | 'reverted' | 'failed';

export interface NovaMitigationActionDocument extends Document {
  mitigationKey:    string;
  anomalyKey:       string;
  incidentKey?:     string;
  actionType:       MitigationActionType;
  scopeType:        'global' | 'portfolio' | 'venture' | 'resolution';
  scopeKey:         string;
  reason:           string;
  status:           MitigationStatus;
  metadata?:        Record<string, unknown>;
  rollbackAvailable: boolean;
  rollbackMetadata?: Record<string, unknown>;
  createdAt:        Date;
  updatedAt:        Date;
}

const NovaMitigationActionSchema = new Schema<NovaMitigationActionDocument>(
  {
    mitigationKey: { type: String, required: true, unique: true, index: true },
    anomalyKey:    { type: String, required: true, index: true },
    incidentKey:   { type: String, index: true },
    actionType:    { type: String, enum: ['reduce_exposure','pause_execution','downgrade_autonomy','block_auto_approvals','reopen_monitoring','freeze_domain'], required: true, index: true },
    scopeType:     { type: String, enum: ['global','portfolio','venture','resolution'], required: true },
    scopeKey:      { type: String, required: true, index: true },
    reason:        { type: String, required: true },
    status:        { type: String, enum: ['proposed','applied','skipped','reverted','failed'], default: 'proposed', index: true },
    metadata:      { type: Schema.Types.Mixed },
    rollbackAvailable: { type: Boolean, default: false },
    rollbackMetadata:  { type: Schema.Types.Mixed },
    tenantId: { type: String, index: true, default: 'aipilots' },
  },
  { timestamps: true }
);

// Self-healing panel: recent actions sorted by time
NovaMitigationActionSchema.index({ status: 1, createdAt: -1 });
// Rate-limit check: how many applied today?
NovaMitigationActionSchema.index({ status: 1, updatedAt: -1 });

export const NovaMitigationAction: Model<NovaMitigationActionDocument> =
  (mongoose.models.NovaMitigationAction as Model<NovaMitigationActionDocument>) ||
  mongoose.model<NovaMitigationActionDocument>('NovaMitigationAction', NovaMitigationActionSchema);
