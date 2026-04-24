/**
 * models/SeoSystemState.ts
 *
 * DB-backed global system state.
 * Using DB (not in-memory) so state survives server restarts
 * and is consistent across multiple instances.
 *
 * Only one global document (scopeId: 'global').
 */

import { Schema, model, models } from 'mongoose';

const SeoSystemStateSchema = new Schema({
  scopeId: { type: String, default: 'global', unique: true },

  paused:        { type: Boolean, default: false },
  pausedAt:      { type: Date,    default: null  },
  pausedBy:      { type: String,  default: ''    },
  pauseReason:   { type: String,  default: ''    },

  shadowModeOnly: { type: Boolean, default: false },
  operatorMode:   { type: String, enum: ['simple','advanced'], default: 'advanced' },

  lastUpdatedBy:  { type: String, default: 'system' },
}, { timestamps: true });

export default models.SeoSystemState || model('SeoSystemState', SeoSystemStateSchema);
