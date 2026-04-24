/**
 * models/ClientActivityFeed.ts
 *
 * Persistent client-visible growth activity events.
 * Written by drones, SEO engine, and the grow API.
 * Only non-technical, client-readable messages are stored here.
 *
 * type:
 *   publish     → pages published
 *   ranking     → keyword moved position
 *   link        → internal links optimized
 *   discovery   → new keyword clusters found
 *   optimize    → CTR / on-page optimization
 *   audit       → site audit run
 *   report      → weekly report generated
 */
import mongoose, { Schema } from 'mongoose';

const ClientActivityFeedSchema = new Schema(
  {
    userId:    { type: String, index: true, required: true }, // matches User._id
    tenantId:  { type: String, index: true, default: 'default' },

    type: {
      type: String,
      required: true,
      // publish|ranking|link|discovery|optimize|audit|report
    },

    message:   { type: String, required: true }, // "12 new pages published for Palmdale Roofing"
    icon:      { type: String, default: '✅' },  // emoji for UI
    detail:    { type: String, default: '' },    // optional sub-detail

    metadata: {
      pagesAffected:  { type: Number, default: 0 },
      keyword:        { type: String, default: '' },
      positionBefore: { type: Number },
      positionAfter:  { type: Number },
      linkCount:      { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

ClientActivityFeedSchema.index({ userId: 1, createdAt: -1 });
ClientActivityFeedSchema.index({ tenantId: 1, type: 1, createdAt: -1 });

export default mongoose.models.ClientActivityFeed ||
  mongoose.model('ClientActivityFeed', ClientActivityFeedSchema);
