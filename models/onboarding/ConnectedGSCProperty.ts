/**
 * models/onboarding/ConnectedGSCProperty.ts
 *
 * One GSC property per client.
 * Uses service account auth (GOOGLE_CREDENTIALS_JSON) not per-user OAuth.
 * This matches the existing search-console/connect pattern.
 *
 * propertyType:
 *   url_prefix → https://www.example.com/
 *   domain     → sc-domain:example.com
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

const ConnectedGSCPropertySchema = new Schema({
  tenantId: { type: String, index: true, required: true },
  clientId: { type: String, index: true, required: true },

  // The exact property URL as it appears in GSC
  propertyUrl:  { type: String, index: true, required: true },
  propertyType: { type: String, default: 'url_prefix' }, // url_prefix | domain
  verified:     { type: Boolean, default: false },

  // Service account auth (no per-user OAuth needed)
  serviceAccount: {
    email:       { type: String, default: '' }, // client_email from GOOGLE_CREDENTIALS_JSON
    connectedAt: { type: Date },
    lastSyncAt:  { type: Date },
  },

  access: {
    canQueryPerformance: { type: Boolean, default: false },
    canInspectIndexing:  { type: Boolean, default: false },
    testFetchSuccess:    { type: Boolean, default: false },
  },

  // Validation result vs connected domain
  domainMatch: {
    valid:     { type: Boolean, default: false },
    matchType: { type: String, default: '' }, // url_prefix | domain_property | no_match
    warnings:  [{ type: String }],
  },

  metadata: {
    country:              { type: String, default: '' },
    sitemapUrl:           { type: String, default: '' },
    notes:                { type: String, default: '' },
  },
}, { timestamps: true });

ConnectedGSCPropertySchema.index({ tenantId: 1, clientId: 1 }, { unique: true });

export type ConnectedGSCPropertyDocument = InferSchemaType<typeof ConnectedGSCPropertySchema>;
export default mongoose.models.ConnectedGSCProperty ||
  mongoose.model('ConnectedGSCProperty', ConnectedGSCPropertySchema);
