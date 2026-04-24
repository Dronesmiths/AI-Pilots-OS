/**
 * models/governance/CausalShadowPromotionCandidate.ts
 *
 * A bandit flagged as a candidate for promoting from live_reward to causal_weighted_live.
 * Created by getCausalShadowPromotionCandidates() when all evidence gates pass.
 * Status lifecycle: review → promoted | rejected | keep_shadow | paused
 */
import mongoose, { Schema } from 'mongoose';

const CausalShadowPromotionCandidateSchema = new Schema({
  banditId: { type: String, index: true, required: true, unique: true },

  context: {
    anomalyType: { type: String, required: true },
    contextKey:  { type: String, required: true },
  },

  evidence: {
    liveLeader:               { type: String, default: '' },
    shadowLeader:             { type: String, default: '' },
    disagreementRate:         { type: Number, default: 0 },
    shadowAdvantage:          { type: Number, default: 0 },
    avgAttributionConfidence: { type: Number, default: 0 },
    harmfulDelta:             { type: Number, default: 0 },
    sampleSize:               { type: Number, default: 0 },
    gates:                    { type: Schema.Types.Mixed, default: {} },
  },

  evaluation: {
    status:  { type: String, default: 'review', enum: ['review','promoted','rejected','keep_shadow','paused'] },
    summary: { type: String, default: '' },
    notes:   [String],
  },

  suppressedUntil: { type: Date }, // rejection cooldown
}, { timestamps: true });

export default mongoose.models.CausalShadowPromotionCandidate ||
  mongoose.model('CausalShadowPromotionCandidate', CausalShadowPromotionCandidateSchema);
