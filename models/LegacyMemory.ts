import mongoose, { Schema, Document, models, model } from 'mongoose';

export type BrandArchetype = 'teacher' | 'leader' | 'servant' | 'builder';

export interface ILegacyMemory extends Document {
  tenantId:          string;

  // ── Identity ──
  dominantThemes:    string[];   // recurring content/topic areas
  contentDNA:        string[];   // communication style patterns
  audienceType:      string[];   // who they serve

  // ── Archetype ──
  growthArchetype:   BrandArchetype;

  // ── Score ──
  legacyScore:       number;   // 0–100

  // ── Evolution ──
  brandVoiceEvolution: Array<{
    date:    Date;
    tone:    string;   // e.g. 'informational', 'authoritative', 'leader', 'community'
    trigger: string;   // what caused the shift
  }>;

  // ── Milestones ──
  historicalMilestones: Array<{
    date:        Date;
    type:        string;
    description: string;
  }>;

  // ── Strategy signals ──
  monthlyPatternHistory:   string[];   // last 12 monthly patterns
  quarterlyPositionHistory: string[];  // last 4+ quarterly positions

  // ── Narratives ──
  lastAgentNarrative:   string;
  lastClientNarrative:  string;

  updatedAt:           Date;
}

const LegacyMemorySchema = new Schema<ILegacyMemory>({
  tenantId:          { type: String, required: true, index: true, unique: true },

  dominantThemes:    { type: [String], default: [] },
  contentDNA:        { type: [String], default: [] },
  audienceType:      { type: [String], default: [] },

  growthArchetype:   {
    type:    String,
    enum:    ['teacher', 'leader', 'servant', 'builder'],
    default: 'builder',
  },

  legacyScore: { type: Number, default: 0 },

  brandVoiceEvolution: [{
    date:    { type: Date, default: Date.now },
    tone:    { type: String },
    trigger: { type: String },
  }],

  historicalMilestones: [{
    date:        { type: Date, default: Date.now },
    type:        { type: String },
    description: { type: String },
  }],

  monthlyPatternHistory:    { type: [String], default: [] },
  quarterlyPositionHistory: { type: [String], default: [] },

  lastAgentNarrative:  { type: String },
  lastClientNarrative: { type: String },

  updatedAt: { type: Date, default: Date.now },
}, { timestamps: false });

const LegacyMemory = models.LegacyMemory ?? model<ILegacyMemory>('LegacyMemory', LegacyMemorySchema);
export default LegacyMemory;
