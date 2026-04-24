/**
 * models/onboarding/ConnectedDomain.ts
 *
 * One record per client domain.
 * Connected vs verified are intentionally separate:
 *   connected = domain record exists and reachability checked
 *   verified  = DNS/HTML/meta verification token confirmed
 *
 * For v1, manual verification is fine — verification.method = 'manual'.
 */
import mongoose, { Schema, InferSchemaType } from 'mongoose';

const ConnectedDomainSchema = new Schema({
  tenantId: { type: String, index: true, required: true },
  clientId: { type: String, index: true, required: true },

  // User-provided raw input preserved for display
  rawInput:         { type: String, default: '' },
  domain:           { type: String, index: true, required: true }, // example.com
  normalizedDomain: { type: String, index: true, required: true }, // example.com (no www, no protocol)
  host:             { type: String, default: '' },                  // www.example.com
  urlPrefix:        { type: String, default: '' },                  // https://www.example.com/
  domainProperty:   { type: String, default: '' },                  // sc-domain:example.com

  verification: {
    method:     { type: String, default: 'manual' }, // dns | html | meta | manual
    status:     { type: String, default: 'pending' }, // pending | verified | failed
    token:      { type: String, default: '' },
    verifiedAt: { type: Date },
  },

  hosting: {
    provider:      { type: String, default: '' },   // vercel | cloudflare | github_pages | unknown
    repoUrl:       { type: String, default: '' },   // https://github.com/owner/repo
    repoOwner:     { type: String, default: '' },
    repoName:      { type: String, default: '' },
    repoBranch:    { type: String, default: 'main' },
    deployHookUrl: { type: String, default: '' },
    siteUrl:       { type: String, default: '' },
    githubWritable: { type: Boolean, default: false },
  },

  crawlState: {
    sitemapUrl:    { type: String, default: '' },
    robotsUrl:     { type: String, default: '' },
    lastCheckedAt: { type: Date },
    reachable:     { type: Boolean, default: false },
    statusCode:    { type: Number, default: 0 },
    consecutiveFailures: { type: Number, default: 0 },
  },
}, { timestamps: true });

ConnectedDomainSchema.index({ tenantId: 1, domain: 1 }, { unique: true });

export type ConnectedDomainDocument = InferSchemaType<typeof ConnectedDomainSchema>;
export default mongoose.models.ConnectedDomain ||
  mongoose.model('ConnectedDomain', ConnectedDomainSchema);
