/**
 * models/NovaClusterFamily.ts
 *
 * A discovered family of behaviorally similar clusters.
 * Created/updated by discoverClusterFamilies().
 *
 * familyId: deterministic ("family_" + centroid clusterKey) for idempotent runs
 * members: list of clusterKeys belonging to this family
 * centroidProfile: the representative profile used for family-level prior blending
 */

import mongoose from 'mongoose';

const NovaClusterFamilySchema = new mongoose.Schema(
  {
    familyId:       { type: String, required: true, unique: true, index: true },
    members:        { type: [String], default: [] },
    centroidProfile:{ type: mongoose.Schema.Types.Mixed, default: {} },
    confidence:     { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.NovaClusterFamily ||
  mongoose.model('NovaClusterFamily', NovaClusterFamilySchema);
