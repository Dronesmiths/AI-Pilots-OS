/**
 * models/governance/ContextualBanditMergeCandidate.ts
 *
 * Records a proposed merge back from a contextual bandit into its global fallback.
 * Merge candidates are created by evaluateContextualBanditMerging() and must be
 * explicitly approved (via API/UI) before the merge executes.
 *
 * status lifecycle: pending → approved → merged | rejected
 */
import mongoose, { Schema } from 'mongoose';

const ContextualBanditMergeCandidateSchema = new Schema({
  contextualBanditId: { type: String, index: true, required: true, unique: true },
  globalBanditId:     { type: String, index: true, required: true },
  contextKey:         { type: String, index: true, required: true },

  evidence: {
    rewardDelta:       { type: Number, default: 0 },
    harmDelta:         { type: Number, default: 0 },
    sameTopArm:        { type: Boolean, default: false },
    totalPulls:        { type: Number, default: 0 },
    recentPulls:       { type: Number, default: 0 },
    daysSinceLastPull: { type: Number, default: 0 },
    signalCount:       { type: Number, default: 0 },  // how many merge signals triggered
  },

  evaluation: {
    status:  { type: String, default: 'pending', enum: ['pending', 'approved', 'merged', 'rejected'] },
    summary: { type: String, default: '' },
    notes:   [String],
  },
}, { timestamps: true });

export default mongoose.models.ContextualBanditMergeCandidate ||
  mongoose.model('ContextualBanditMergeCandidate', ContextualBanditMergeCandidateSchema);
