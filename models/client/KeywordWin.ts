/**
 * models/client/KeywordWin.ts
 *
 * Records confirmed keyword position improvements for the wins feed.
 * Populated by the drone system or GSC sync when a keyword moves up.
 * Displayed on /dashboard → "Recent Wins" section.
 */
import mongoose, { Schema } from 'mongoose';

const KeywordWinSchema = new Schema({
  domain:          { type: String, required: true, index: true, lowercase: true, trim: true },
  keyword:         { type: String, required: true },
  oldPosition:     { type: Number, required: true },
  newPosition:     { type: Number, required: true },
  impressionsLift: { type: Number, default: 0 },
  clicksLift:      { type: Number, default: 0 },
  weekStart:       { type: Date,   required: true, index: true },
  notes:           { type: String, default: '' },
  source:          { type: String, default: 'gsc', enum: ['gsc','manual','drone'] },
}, { timestamps: true });

KeywordWinSchema.index({ domain: 1, weekStart: -1 });

export default mongoose.models.KeywordWin ||
  mongoose.model('KeywordWin', KeywordWinSchema);
