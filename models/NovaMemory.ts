/**
 * models/NovaMemory.ts
 *
 * Structured store of every Nova decision — what the user asked,
 * what Nova did, the system context at that moment, and whether it worked.
 *
 * Used by:
 *   - enhanceNovaDecision (duplicate detection, confirmation threshold)
 *   - findRelevantMemory  (recent action lookup by action+target)
 *   - Nova memory panel UI
 *   - Bandit calibration (future: feed successful outcomes back into rewards)
 */

import { Schema, model, models } from 'mongoose';

const NovaMemorySchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null, index: true },
    userId:      { type: Schema.Types.ObjectId, ref: 'User',      default: null, index: true },

    source: {
      type:     String,
      enum:     ['command_bar','voice','api','operator_panel'],
      required: true,
      index:    true,
    },

    rawInput: { type: String, required: true, index: true },

    normalized: {
      action: { type: String, default: '', index: true },
      target: { type: String, default: '', index: true },
      scope:  { type: String, default: '' },
    },

    execution: {
      mode: {
        type:    String,
        enum:    ['execute','simulate','system','unknown'],
        default: 'unknown',
      },
      status: {
        type:    String,
        enum:    ['success','failed','blocked','cancelled','simulated'],
        default: 'success',
        index:   true,
      },
      resultSummary: { type: String, default: '' },
      affectedCount: { type: Number, default: 0 },
    },

    // Snapshot of system state at the moment of decision
    context: {
      systemPaused:       { type: Boolean, default: false },
      queuedJobs:         { type: Number,  default: 0 },
      pendingApprovals:   { type: Number,  default: 0 },
      activeCampaigns:    { type: Number,  default: 0 },
      topProblemSite:     { type: String,  default: '' },
      topOpportunitySite: { type: String,  default: '' },
    },

    // Learning signals — updated by outcome evaluator later
    learning: {
      confidenceAtDecision: { type: Number,  default: 0 },
      outcomeScore:         { type: Number,  default: 0 },
      successful:           { type: Boolean, default: false },
    },

    // Enhancement metadata (confirmation required, block reason, etc.)
    enhancement: {
      shouldConfirm:  { type: Boolean, default: false },
      shouldBlock:    { type: Boolean, default: false },
      message:        { type: String,  default: '' },
      userConfirmed:  { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

NovaMemorySchema.index({ createdAt: -1 });
NovaMemorySchema.index({ 'normalized.action': 1, 'normalized.target': 1, createdAt: -1 });
NovaMemorySchema.index({ workspaceId: 1, createdAt: -1 });

export default models.NovaMemory || model('NovaMemory', NovaMemorySchema);
