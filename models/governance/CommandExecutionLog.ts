/**
 * models/governance/CommandExecutionLog.ts
 *
 * Immutable truth record for every executed operator command.
 * Written once on completion — never updated.
 *
 * beforeHash / afterHash: SHA-256 of serialized target state before and after mutation.
 * Enables rollback detection and "what changed" audit queries.
 * Hash generation: lib/governance/hashMutationState.ts
 */

import mongoose, { Schema } from 'mongoose';

const CommandExecutionLogSchema = new Schema(
  {
    tenantId:     { type: String, index: true, required: true },
    commandId:    { type: String, index: true, required: true },
    operatorId:   { type: String, index: true, required: true },
    approverIds:  [{ type: String }],

    commandType:  { type: String, required: true },
    commandClass: { type: String, index: true },
    targetType:   { type: String, required: true },
    targetId:     { type: String, required: true },

    riskScore:  { type: Number, default: 0 },
    riskBand:   { type: String, default: 'low' },

    beforeHash:      { type: String, default: '' },
    afterHash:       { type: String, default: '' },
    mutationSummary: { type: String, default: '' },

    result:       { type: String, required: true }, // success|failed|noop|denied
    resultReason: { type: String, default: '' },

    delegationLevel: { type: String, default: '' }, // what delegation was active at execution
    metadata:        { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

CommandExecutionLogSchema.index({ tenantId: 1, createdAt: -1 });
CommandExecutionLogSchema.index({ tenantId: 1, riskBand: 1, result: 1, createdAt: -1 });
CommandExecutionLogSchema.index({ commandId: 1 }, { unique: true });

export default mongoose.models.CommandExecutionLog ||
  mongoose.model('CommandExecutionLog', CommandExecutionLogSchema);
