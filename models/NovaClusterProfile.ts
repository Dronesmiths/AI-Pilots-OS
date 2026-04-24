/**
 * models/NovaClusterProfile.ts
 *
 * Behavioral profile for a cluster key — the "signature" used for
 * similarity comparison in meta-learning.
 *
 * familyId: assigned by discoverClusterFamilies() after similarity grouping
 * confidence: aggregated from contributing workspace samples
 */

import mongoose from 'mongoose';

const NovaClusterProfileSchema = new mongoose.Schema(
  {
    clusterKey: { type: String, required: true, unique: true, index: true },
    profile: {
      avgAdjustedOutcome:  { type: Number, default: 0   },
      avgAttribution:      { type: Number, default: 0   },
      avgPredictionError:  { type: Number, default: 0   },
      dominantStrategyMode:{ type: String, default: ''  },
      dominantAction:      { type: String, default: ''  },
      trustBoost:          { type: Number, default: 0.5 },
      trustReinforce:      { type: Number, default: 0.5 },
      trustInternalLinks:  { type: Number, default: 0.5 },
      trustPublish:        { type: Number, default: 0.5 },
      recoveryScore:       { type: Number, default: 0   },
      momentumScore:       { type: Number, default: 0   },
      expansionScore:      { type: Number, default: 0   },
      stabilizationScore:  { type: Number, default: 0   },
    },
    familyId:   { type: String, default: '', index: true },
    confidence: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.NovaClusterProfile ||
  mongoose.model('NovaClusterProfile', NovaClusterProfileSchema);
