import mongoose, { Schema, Document } from 'mongoose';

// ============================================================================
// 1. EXTRACTED TYPINGS FOR SUB-SCHEMAS
// ============================================================================

export interface IAgent {
  name?: string;
  twilioNumber?: string;
  vapiAgentId?: string;
  pabblySubscriptionId?: string;
  purchasedAt?: Date;
  safetySettings?: {
    disableBooking?: boolean;
    disableSms?: boolean;
    humanFallback?: boolean;
  };
}

export interface IGmbPost {
  name: string;
  topicType: string;
  summary: string;
  callToAction?: {
    actionType: string;
    url: string;
  };
  state: string;
  createTime: Date;
}

export interface IGmbReview {
  reviewId: string;
  reviewerName: string;
  starRating: string;
  comment: string;
  createTime: Date;
  updateTime: Date;
  reply?: {
    comment: string;
    updateTime: Date;
  };
  isAiReplied: boolean;
  extractedKeywords?: string[];
}

export interface IGodModeReport {
  date: Date;
  summary: string;
  metrics: { [key: string]: any };
}

export interface ISeoCluster {
  keyword: string;
  category?: 'service' | 'location' | 'qa' | 'cornerstone' | 'competitor' | 'paa' | 'blog' | 'article' | 'update';
  heroImage?: string;
  heroAlt?: string;
  midImage?: string;
  midAlt?: string;
  location?: string;
  serviceProduct?: string;
  status: 'idle' | 'idea' | 'draft' | 'queued' | 'generating_images' | 'publishing' | 'publish_failed' | 'published' | 'Live' | 'Failed' | 'Merged' | 'completed' | 'processing';
  repo?: string;
  slug?: string;
  liveUrl?: string;
  scheduledTime?: Date;
  impressions: number;
  clicks: number;
  engagementRate?: number;
  sessions?: number;
  conversions?: number;
  cpc?: number;
  competition?: string;
  currentRank?: number;
  rankTrackedAt?: Date;
  pageSpeedScore?: number;
  speedTrackedAt?: Date;
  pushedAt?: Date;
  lastDeployAttempt?: Date;
  renderHash?: string;
  publishErrorType?: string;
  isLlmQA?: boolean;
  isConsolidated?: boolean;
  needsRefinement?: boolean;
  alternateKeywords?: string[];
  htmlContent?: string;
  metaTitle?: string;
  metaDescription?: string;
  mergeReason?: string;
  mergedInto?: string;
  llmConfidence?: number;
  schemaPreGenerated?: boolean;
  imagesPreGenerated?: boolean;
  faqsPreGenerated?: boolean;
  internalLinksPreGenerated?: boolean;
  backlinksPreGenerated?: boolean;
  githubSyncRequired?: boolean;
  schemaPayload?: string;
  faqsPayload?: string;
  internalLinksPayload?: string;
  backlinksPayload?: string;
  faqSchema?: string;
  authorityMetadata?: {
    status: 'idle' | 'ready' | 'generating' | 'published' | 'ready_for_update';
    autoTrigger: boolean;
    generatedPageId?: string;
    publishedAt?: Date;
    frozenAt?: Date;
    frozenMergedCount?: number;
  };
  backlinkMetadata?: {
    score?: number;
    lastChecked?: Date;
    brokenInternal?: number;
    brokenExternal?: number;
    redirects?: number;
    fixesApplied?: number;
    enhancementsApplied?: number;
    status?: "healthy" | "issues_found" | "repairing";
  };
  imageHealth?: {
    total?: number;
    broken?: number;
    brokenUrls?: string[];
    lastScanned?: Date;
    status?: 'healthy' | 'broken' | 'unscanned';
  };
  // ── Intelligence Layer (strategy pipeline) ──
  clusterGroupId?: string;
  role?: 'primary' | 'supporting';
  gapScore?: number;
  angle?: string;
  // ── Evolution Engine (Phase 2) ──
  pageMetrics?: {
    impressions: number;
    clicks: number;
    avgPosition: number;
    indexed: boolean;
    trend: 'rising' | 'stable' | 'falling' | 'unknown';
    ctr?: number;
    lastChecked: Date;
  };
  nextMove?: 'reinforce' | 'expand_cluster' | 'hold' | 'mark_winner' | 'kill';
  nextMoveReason?: string;
  isWinner?: boolean;
  pageScore?: number;           // 0–100 composite score
  stuckCycles?: number;
  performanceStatus?: 'new' | 'waiting_for_index' | 'gaining_traction' | 'needs_reinforcement' | 'winner' | 'stalled';
  reinforcementPlan?: {
    actions: string[];
    generatedAt: Date;
    applied: boolean;
  };
}

// ── Intelligence Layer interfaces ─────────────────────────────────────────
export interface IClusterGroup {
  id: string;
  label: string;
  intent: 'informational' | 'transactional' | 'navigational' | 'commercial';
  primaryKeyword: string;
  supportingKeywords: string[];
  gapScore: number;
  angle?: string;
  pageStrategyId?: string;
  createdAt: Date;
  // ── Evolution Engine (Phase 2) ──
  evolutionState?: 'building' | 'gaining_traction' | 'winner' | 'stalled' | 'killed';
  winnerPageSlugs?: string[];
  expansionTriggered?: boolean;
  expansionTriggeredAt?: Date;
  lastEvolvedAt?: Date;
}

export interface ICompSnapshot {
  domain: string;
  url: string;
  title?: string;
  headings: string[];
  wordCount?: number;
  coveredTopics: string[];
  capturedAt: Date;
}

export interface IGapInsight {
  topic: string;
  competitorsCovering: string[];
  competitorsMissing: string[];
  searchVolume: number;
  gapScore: number;
  recommendedClusterId?: string;
  detectedAt: Date;
}

export interface IPageStrategy {
  clusterId: string;
  primaryKeyword: string;
  supportingKeywords: string[];
  uniqueAngle: string;
  internalLinks: string[];
  targetWordCount: number;
  status: 'planned' | 'generating' | 'published';
  createdAt: Date;
}

export interface IUser extends Document {
  // 1. Core Profile
  email: string;
  name: string;
  targetDomain?: string;
  brandTheme?: string;
  clientArchitectureNotes?: string;
  referralCode?: string;
  referredBy?: string;
  planMinutes?: number;
  available_credits?: number;
  createdAt: Date;
  updatedAt: Date;

  // 2. Integration Keys
  githubRepo?: string;
  githubOwner?: string;
  ga4PropertyId?: string;
  googleAdsCustomerId?: string;
  googleCalendarConnected?: boolean;
  googleRefreshToken?: string;
  dataForSeoLogin?: string;
  dataForSeoPassword?: string;
  pageSpeedApiKey?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  gscSiteProperty?: string;       // e.g. 'sc-domain:urbandesignremodel.com'
  gscConnectedAt?: Date;

  // 3. Communications & Voice Settings
  twilioNumber: string;
  vapiAgentId: string;
  personalPhone?: string;
  whatsappApiConnected?: boolean;
  whatsappPhoneNumber?: string;
  metaAccessToken?: string;
  metaAccountId?: string;
  pabblySubscriptionId?: string;
  elevenLabsVoiceId?: string;
  favoriteVoices?: {
    voiceId: string;
    name: string;
    preview_url: string;
  }[];
  agents?: IAgent[];

  // 4. Drone Automation Defaults
  seoEngine?: string;
  seoAutomation?: boolean;
  autoScoutFrequency?: 'daily' | 'weekly' | 'monthly';
  autoScoutQueueLimit?: number;
  llmQAAutomation?: boolean;
  targetServiceAreas?: string[];
  dailyPageProductionLimit?: number;
  pageBuilderTemplates?: {
    location?: string;
    service?: string;
    blog?: string;
    cornerstone?: string;
  };
  onboardingConfig?: {
      sandboxFolder: string;
      seedKeywords: string;
      targetLocations: string;
      brandingTheme: string;
      updatedAt: Date;
      status?: 'created' | 'repo_inspecting' | 'plan_ready' | 'deployment_connected' | 'engine_activating' | 'engine_active' | 'error';
      qaFactoryStatus?: string;
      qaFactoryIgnitedAt?: Date;
      clientReportingEmail?: string;
      resendVerified?: boolean;
      telemetryDeployed?: boolean;
      testPageDeployed?: boolean;
      testPageUrl?: string;
  };

  // 5. Matrices & Ledgers
  godModeReports?: IGodModeReport[];
  gmbAccountId?: string;
  gmbLocationId?: string;
  gmbPosts?: IGmbPost[];
  gmbReviews?: IGmbReview[];
  seoClusters?: ISeoCluster[];
  clusterGroups?: IClusterGroup[];
  competitorSnapshots?: ICompSnapshot[];
  gapInsights?: IGapInsight[];
  pageStrategies?: IPageStrategy[];
  imageLibrary?: Array<{
    slug: string;
    keyword: string;
    githubUrl: string;
    replicateUrl?: string;
    schema?: Record<string, any>;
    savedAt: Date;
    status: 'library';
  }>;
  seoActivityLog?: Array<{
    type: 'page_published' | 'gaining_traction' | 'reinforcement_queued' | 'cluster_expanded' | 'marked_winner';
    message: string;
    keyword?: string;
    clusterId?: string;
    at: Date;
  }>;
  redirects?: {
    source: string;
    destination: string;
  }[];
}

// ============================================================================
// 2. MONGOOSE SUB-SCHEMAS DEFINITIONS
// ============================================================================

const AgentSchema = new Schema({
  name: { type: String, required: false },
  twilioNumber: { type: String, required: false },
  vapiAgentId: { type: String, required: false },
  pabblySubscriptionId: { type: String, required: false },
  purchasedAt: { type: Date, default: Date.now },
  safetySettings: {
    disableBooking: { type: Boolean, default: false },
    disableSms: { type: Boolean, default: false },
    humanFallback: { type: Boolean, default: false }
  }
});

const GmbPostSchema = new Schema({
  name: { type: String, required: true },
  topicType: { type: String, required: true },
  summary: { type: String, required: true },
  callToAction: {
     actionType: { type: String, required: false },
     url: { type: String, required: false }
  },
  state: { type: String, required: true },
  createTime: { type: Date, required: true }
});

const GmbReviewSchema = new Schema({
  reviewId: { type: String, required: true },
  reviewerName: { type: String, required: true },
  starRating: { type: String, required: true },
  comment: { type: String, required: false },
  createTime: { type: Date, required: true },
  updateTime: { type: Date, required: true },
  reply: {
     comment: { type: String, required: false },
     updateTime: { type: Date, required: false }
  },
  isAiReplied: { type: Boolean, default: false },
  extractedKeywords: [{ type: String }]
});

const GodModeReportSchema = new Schema({
  date: { type: Date, default: Date.now },
  summary: { type: String },
  metrics: { type: Schema.Types.Mixed, default: {} }
});

const SeoClusterSchema = new Schema({
  keyword: { type: String, required: false },
  category: {
    type: String,
    enum: ['service', 'location', 'qa', 'cornerstone', 'competitor', 'paa', 'blog', 'article', 'update'],
    default: 'service'
  },
  heroImage: { type: String, required: false },
  heroAlt: { type: String, required: false },
  midImage: { type: String, required: false },
  midAlt: { type: String, required: false },
  location: { type: String, required: false },
  serviceProduct: { type: String, required: false },
  status: { 
    type: String, 
    enum: ['idle', 'idea', 'draft', 'queued', 'generating_images', 'publishing', 'publish_failed', 'published', 'Live', 'Failed', 'Merged', 'completed', 'processing'], 
    default: 'idea' 
  },
  repo: { type: String, required: false },
  slug: { type: String, required: false },
  liveUrl: { type: String, required: false },
  scheduledTime: { type: Date, required: false },
  lastDeployAttempt: { type: Date, required: false },
  renderHash: { type: String, required: false },
  publishErrorType: { type: String, required: false },
  impressions: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  engagementRate: { type: Number, default: 0 },
  sessions: { type: Number, default: 0 },
  conversions: { type: Number, default: 0 },
  cpc: { type: Number, required: false },
  competition: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW', 'UNSPECIFIED'], required: false },
  currentRank: { type: Number, required: false },
  rankTrackedAt: { type: Date, required: false },
  pageSpeedScore: { type: Number, required: false },
  speedTrackedAt: { type: Date, required: false },
  isLlmQA: { type: Boolean, default: false },
  isConsolidated: { type: Boolean, default: false },
  needsRefinement: { type: Boolean, default: false },
  alternateKeywords: [{ type: String }],
  htmlContent: { type: String, required: false },
  metaTitle: { type: String, required: false },
  metaDescription: { type: String, required: false },
  mergeReason: { type: String, required: false },
  mergedInto: { type: String, required: false },
  llmConfidence: { type: Number, required: false },
  schemaPreGenerated: { type: Boolean, default: false },
  imagesPreGenerated: { type: Boolean, default: false },
  faqsPreGenerated: { type: Boolean, default: false },
  internalLinksPreGenerated: { type: Boolean, default: false },
  backlinksPreGenerated: { type: Boolean, default: false },
  githubSyncRequired: { type: Boolean, default: false },
  schemaPayload: { type: String, required: false },
  faqsPayload: { type: String, required: false },
  internalLinksPayload: { type: String, required: false },
  backlinksPayload: { type: String, required: false },
  faqSchema: { type: String, required: false },
  authorityMetadata: {
    status: { type: String, enum: ['idle', 'ready', 'generating', 'published', 'ready_for_update'], default: 'idle' },
    autoTrigger: { type: Boolean, default: false },
    generatedPageId: { type: String, required: false },
    publishedAt: { type: Date, required: false },
    frozenAt: { type: Date, required: false },
    frozenMergedCount: { type: Number, required: false }
  },
  backlinkMetadata: {
    score: { type: Number },
    lastChecked: { type: Date },
    brokenInternal: { type: Number, default: 0 },
    brokenExternal: { type: Number, default: 0 },
    redirects: { type: Number, default: 0 },
    fixesApplied: { type: Number, default: 0 },
    enhancementsApplied: { type: Number, default: 0 },
    status: { type: String, enum: ["healthy", "issues_found", "repairing"], default: 'healthy' }
  },
  imageHealth: {
    total:       { type: Number, default: 0 },
    broken:      { type: Number, default: 0 },
    brokenUrls:  [{ type: String }],
    lastScanned: { type: Date },
    status:      { type: String, enum: ['healthy', 'broken', 'unscanned'], default: 'unscanned' },
  },
  pushedAt: { type: Date, default: Date.now },
  // ── Evolution Engine fields ──
  pageMetrics: {
    impressions:  { type: Number, default: 0 },
    clicks:       { type: Number, default: 0 },
    avgPosition:  { type: Number, default: 0 },
    indexed:      { type: Boolean, default: false },
    trend:        { type: String, enum: ['rising', 'stable', 'falling', 'unknown'], default: 'unknown' },
    ctr:          { type: Number, default: 0 },
    lastChecked:  { type: Date },
  },
  nextMove:       { type: String, enum: ['reinforce', 'expand_cluster', 'hold', 'mark_winner', 'kill'] },
  nextMoveReason: { type: String },
  stuckCycles:    { type: Number, default: 0 },
  isWinner:       { type: Boolean, default: false },
  reinforcementPlan: {
    actions:      [{ type: String }],
    generatedAt:  { type: Date },
    applied:      { type: Boolean, default: false },
  },
});

// ── Intelligence Layer Sub-Schemas ───────────────────────────────────────
const ClusterGroupSchema = new Schema({
  id:                 { type: String, required: true },
  label:              { type: String, required: true },
  intent:             { type: String, enum: ['informational', 'transactional', 'navigational', 'commercial'], default: 'informational' },
  primaryKeyword:     { type: String, required: true },
  supportingKeywords: [{ type: String }],
  gapScore:           { type: Number, default: 0 },
  angle:              { type: String },
  pageStrategyId:     { type: String },
  createdAt:          { type: Date, default: Date.now },
  // ── Evolution Engine fields ──
  evolutionState:        { type: String, enum: ['building', 'gaining_traction', 'winner', 'stalled', 'killed'], default: 'building' },
  winnerPageSlugs:       [{ type: String }],
  expansionTriggered:    { type: Boolean, default: false },
  expansionTriggeredAt:  { type: Date },
  lastEvolvedAt:         { type: Date },
});

const CompSnapshotSchema = new Schema({
  domain:         { type: String, required: true },
  url:            { type: String, required: true },
  title:          { type: String },
  headings:       [{ type: String }],
  wordCount:      { type: Number },
  coveredTopics:  [{ type: String }],
  capturedAt:     { type: Date, default: Date.now },
});

const GapInsightSchema = new Schema({
  topic:                  { type: String, required: true },
  competitorsCovering:    [{ type: String }],
  competitorsMissing:     [{ type: String }],
  searchVolume:           { type: Number, default: 0 },
  gapScore:               { type: Number, default: 0 },
  recommendedClusterId:   { type: String },
  detectedAt:             { type: Date, default: Date.now },
});

const PageStrategySchema = new Schema({
  clusterId:          { type: String, required: true },
  primaryKeyword:     { type: String, required: true },
  supportingKeywords: [{ type: String }],
  uniqueAngle:        { type: String, required: true },
  internalLinks:      [{ type: String }],
  targetWordCount:    { type: Number, default: 1200 },
  status:             { type: String, enum: ['planned', 'generating', 'published'], default: 'planned' },
  createdAt:          { type: Date, default: Date.now },
});

// ============================================================================
// 3. MASTER USER SCHEMA
// ============================================================================

const UserSchema: Schema = new Schema(
  {
    // ---------- 1. Core Profile ----------
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    targetDomain: { type: String, required: false },
    brandTheme: { type: String, required: false },
    clientArchitectureNotes: { type: String, required: false }, // Dedicated ledger block for AI to store site structures and drone-specific rules
    referralCode: { type: String, required: false, unique: true, sparse: true },
    referredBy: { type: String, required: false },
    planMinutes: { type: Number, required: false },
    available_credits: { type: Number, required: false },

    // ---------- 2. Integration Keys ----------
    githubRepo: { type: String, required: false },
    githubOwner: { type: String, required: false },
    ga4PropertyId: { type: String, required: false },
    googleAdsCustomerId: { type: String, required: false },
    googleCalendarConnected: { type: Boolean, default: false },
    googleRefreshToken: { type: String, required: false },
    dataForSeoLogin: { type: String, required: false },
    dataForSeoPassword: { type: String, required: false },
    pageSpeedApiKey: { type: String, required: false },
    cloudflareAccountId: { type: String, required: false },
    cloudflareApiToken: { type: String, required: false },
    gscSiteProperty: { type: String, required: false },
    gscConnectedAt: { type: Date, required: false },

    // ---------- 3. Communications & Voice ----------
    twilioNumber: { type: String, required: false },
    vapiAgentId: { type: String, required: false },
    personalPhone: { type: String, required: false },
    whatsappApiConnected: { type: Boolean, default: false },
    metaAccessToken: { type: String, required: false },
    metaAccountId: { type: String, required: false },
    whatsappPhoneNumber: { type: String, required: false },
    pabblySubscriptionId: { type: String, required: false },

    // ---------- 3.1 Overriding Operational States ----------
    novaStrategyOverride: {
      mode: { type: String, enum: ["aggressive", "conservative", "recovery", "expansion", "stabilization"], required: false },
      setAt: { type: Date, default: null }
    },

    // Phase 15 Fleet Intelligence Bounds
    globalIntelligence: {
      enabled: { type: Boolean, default: true },
      publishLocalOutcomes: { type: Boolean, default: true },
      consumeGlobalPriors: { type: Boolean, default: true }
    },
    
    // Phase 16 Temporal Plan Engine
    novaPlanningMode: {
      type: String,
      enum: ["simple", "advanced"],
      default: "advanced"
    },
    
    source: { type: String, enum: ["voice", "ui", "system"], required: false },
    elevenLabsVoiceId: { type: String, required: false },
    favoriteVoices: [
      {
        voiceId: { type: String, required: true },
        name: { type: String, required: true },
        preview_url: { type: String, required: true }
      }
    ],
    agents: [AgentSchema],

    // ---------- 4. Drone Automation Defaults ----------
    seoEngine: { type: String, required: false },
    seoAutomation: { type: Boolean, default: false },
    autoScoutFrequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
    autoScoutQueueLimit: { type: Number, default: 50 },
    llmQAAutomation: { type: Boolean, default: false },
    targetServiceAreas: [{ type: String }],
    dailyPageProductionLimit: { type: Number, required: false, default: 5 },
    pageBuilderTemplates: {
      location: { type: String, required: false },
      service: { type: String, required: false },
      blog: { type: String, required: false },
      cornerstone: { type: String, required: false }
    },
    onboardingConfig: {
      sandboxFolder: { type: String, required: false },
      seedKeywords: { type: String, required: false },
      targetLocations: { type: String, required: false },
      brandingTheme: { type: String, required: false },
      status: { 
        type: String, 
        enum: ['created', 'repo_inspecting', 'plan_ready', 'deployment_connected', 'engine_activating', 'engine_active', 'error', 'pending_scan'],
        default: 'created'
      },
      updatedAt: { type: Date, required: false },
      qaFactoryStatus: { type: String, required: false },
      qaFactoryIgnitedAt: { type: Date, required: false },
      clientReportingEmail: { type: String, required: false },
      clientPhone:          { type: String, required: false },   // for Nova client briefing calls
      resendVerified: { type: Boolean, default: false },
      telemetryDeployed: { type: Boolean, default: false },
      testPageDeployed: { type: Boolean, default: false },
      testPageUrl: { type: String, required: false },
      resendNote: { type: String, required: false }
    },

    // ---------- Nova Autonomy Config ----------
    novaAutonomy: {
      mode: {
        type: String,
        enum: ['observation_only', 'approval_required', 'bounded_autonomy', 'full_autonomy'],
        default: 'approval_required',
      },
      // Action types Nova is allowed to auto-execute in bounded/full mode
      allowedAutoActions: {
        type: [String],
        default: ['create_page', 'followup_campaign'],
      },
      // Safety caps
      maxDailyAutoExecutions: { type: Number, default: 2 },
      cooldownMinutes:        { type: Number, default: 60 },
      // Counters (reset daily by cron)
      autoExecutionsToday:    { type: Number, default: 0 },
      lastAutoExecutedAt:     { type: Date },
    },

    // ---------- Client Voice Interface ----------
    clientVoice: {
      assistantId:  { type: String },
      agentName:    { type: String, default: 'Your Business Assistant' },
      phoneNumber:  { type: String },
      enabled:      { type: Boolean, default: false },
      provisionedAt:{ type: Date },

      // ── Memory layer ────────────────────────────────────────────
      memory: {
        lastCallAt:        { type: Date },
        lastMessageType:   { type: String },
        lastSummary:       { type: String },
        recentHighlights:  { type: [String], default: [] },
        callCountThisWeek: { type: Number, default: 0 },
        weekStartedAt:     { type: Date },
      },

      // ── Brand voice personality ────────────────────────────────
      brandVoiceProfile: {
        type:       { type: String, enum: ['contractor', 'professional', 'startup', 'ministry'], default: 'professional' },
        customName: { type: String },               // optional white-label name override
        toneOverrides: {
          enthusiasm: { type: Number, min: 0, max: 1, default: 0.5 },
          formality:  { type: Number, min: 0, max: 1, default: 0.5 },
        },
      },

      // ── Momentum ───────────────────────────────────────────────
      momentum: {
        score:       { type: Number, default: 0 },
        state:       { type: String, enum: ['early', 'building', 'accelerating', 'stable', 'breakthrough'], default: 'early' },
        updatedAt:   { type: Date },
      },

      // ── Milestone memory ───────────────────────────────────────
      milestones: {
        achieved:          { type: [String], default: [] },  // e.g. ['first_page','five_pages']
        lastCelebratedAt:  { type: Date },
      },

      // ── Weekly story ───────────────────────────────────────────
      weeklyStory: {
        lastSentAt:   { type: Date },
        lastSummary:  { type: String },
      },

      // ── Monthly strategy memory ────────────────────────────────
      strategyMemory: {
        lastSentAt:          { type: Date },
        lastPattern:         { type: String },   // 'cluster_dominant' | 'topic_expansion' | 'foundation_building'
        lastRecommendation:  { type: String },
        lastNarrative:       { type: String },
      },

      // ── Quarterly vision memory ────────────────────────────────
      visionMemory: {
        lastSentAt:       { type: Date },
        lastPosition:     { type: String },   // 'early_presence' | 'emerging_authority' | 'niche_domination'
        lockedDirection:  { type: String },   // agent-chosen direction: 'expand_clusters' | 'broaden_reach' | 'deepen_niche'
        lastNarrative:    { type: String },
      },
    },

    // ---------- 5. Matrices & Ledgers ----------
    godModeReports: [GodModeReportSchema],
    gmbAccountId: { type: String, required: false },
    gmbLocationId: { type: String, required: false },
    gmbPosts: [GmbPostSchema],
    gmbReviews: [GmbReviewSchema],
    seoClusters: [SeoClusterSchema],
    clusterGroups:       [ClusterGroupSchema],
    competitorSnapshots: [CompSnapshotSchema],
    gapInsights:         [GapInsightSchema],
    pageStrategies:      [PageStrategySchema],
    seoActivityLog: [{
      type:      { type: String, enum: ['page_published', 'gaining_traction', 'reinforcement_queued', 'cluster_expanded', 'marked_winner'] },
      message:   { type: String },
      keyword:   { type: String },
      clusterId: { type: String },
      at:        { type: Date, default: Date.now },
    }],
    imageLibrary: [{
      slug:         { type: String },
      keyword:      { type: String },
      githubUrl:    { type: String },
      replicateUrl: { type: String },
      schema:       { type: Schema.Types.Mixed },
      savedAt:      { type: Date, default: Date.now },
      status:       { type: String, default: 'library' }
    }],
    redirects: [
      {
        source: { type: String, required: true },
        destination: { type: String, required: true }
      }
    ]
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Prevent mongoose from recompiling the model in production, but aggressively flush in dev
if (process.env.NODE_ENV !== 'production') {
  delete mongoose.models.User;
}
export default mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
