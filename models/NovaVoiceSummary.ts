import mongoose, { Schema } from 'mongoose';

/**
 * NovaVoiceSummary
 * ─────────────────
 * Stores a generated TTS audio clip alongside the text script and
 * the context that triggered it. Served by the /api/nova/voice-summary
 * route and linked from notification emails.
 *
 * Audio stored as a Buffer (MongoDB Binary) — TTS clips are typically
 * 30–90s, well under MongoDB's 16MB document limit.
 */
const NovaVoiceSummarySchema = new Schema(
  {
    tenantId:    { type: String, required: true, index: true },

    // What triggered this summary
    triggerType: {
      type: String,
      enum: ['page_created', 'insight_detected', 'action_executed', 'call_summary', 'manual'],
      default: 'manual',
    },
    triggerRef:  { type: String },   // e.g. actionId, callRecordId

    // The script Nova spoke
    script:      { type: String, required: true },

    // TTS audio (MP3 bytes)
    audioBuffer: { type: Buffer },
    audioSize:   { type: Number, default: 0 },   // bytes
    voice:       { type: String, default: 'nova' }, // OpenAI voice name

    // Context shown on the player page
    title:       { type: String, default: 'Nova Update' },
    subtitle:    { type: String },
    keyword:     { type: String },
    actionType:  { type: String },
    targetDomain:{ type: String },

    // Delivery
    emailedAt:   { type: Date },
    playCount:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

NovaVoiceSummarySchema.index({ tenantId: 1, createdAt: -1 });

export default mongoose.models.NovaVoiceSummary ||
  mongoose.model('NovaVoiceSummary', NovaVoiceSummarySchema);
