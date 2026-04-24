/**
 * models/boardroom/NovaMitigationGuardrail.ts
 *
 * Singleton configuration record for system-wide constitutional mitigation limits.
 * There is exactly one active guardrail config (guardrailKey = 'global::guardrail').
 *
 * Constitutional limits (enforced in code, cannot be changed by any config):
 *   Nova NEVER deletes records
 *   Nova NEVER exits a venture automatically
 *   Nova NEVER raises exposure as mitigation
 *   Nova NEVER overrides doctrine protection
 *
 * Configurable operational limits (stored here, adjustable by operators):
 *   maxAutoMitigationsPerHour:         rate cap across the whole system
 *   cooldownHoursBetweenSameScopeMitigations: prevents rapid re-triggering on same scope
 *   requireHumanApprovalAboveCapitalAmount:   dollar threshold where human sign-off needed
 *   requireHumanApprovalForCriticalSeverity:  if true, critical anomaly mitigations need human
 *   blockAllAutonomousMitigation:             master kill switch (emergency brake)
 */
import mongoose, { Document, Model, Schema } from 'mongoose';

export interface NovaMitigationGuardrailDocument extends Document {
  guardrailKey:                              string;   // always 'global::guardrail'

  // Operational rate limits
  maxAutoMitigationsPerHour:                number;
  cooldownHoursBetweenSameScopeMitigations: number;

  // Human approval thresholds
  requireHumanApprovalAboveCapitalAmount:   number;   // 0 = never, >0 = dollar gate
  requireHumanApprovalForCriticalSeverity:  boolean;  // true = critical always needs human

  // Master brake
  blockAllAutonomousMitigation:             boolean;  // emergency stop

  createdAt: Date;
  updatedAt: Date;
}

const NovaMitigationGuardrailSchema = new Schema<NovaMitigationGuardrailDocument>(
  {
    guardrailKey: { type: String, required: true, unique: true, index: true },
    maxAutoMitigationsPerHour:                { type: Number, default: 5   },
    cooldownHoursBetweenSameScopeMitigations: { type: Number, default: 4   },
    requireHumanApprovalAboveCapitalAmount:   { type: Number, default: 500 },   // $500 gate
    requireHumanApprovalForCriticalSeverity:  { type: Boolean, default: false },
    blockAllAutonomousMitigation:             { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const NovaMitigationGuardrail: Model<NovaMitigationGuardrailDocument> =
  (mongoose.models.NovaMitigationGuardrail as Model<NovaMitigationGuardrailDocument>) ||
  mongoose.model<NovaMitigationGuardrailDocument>('NovaMitigationGuardrail', NovaMitigationGuardrailSchema);
