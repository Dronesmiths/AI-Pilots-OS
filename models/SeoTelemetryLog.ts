import mongoose from 'mongoose';

const SeoTelemetryLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  nodesIgnited: { type: Number, required: true },
  triggerSource: { type: String, required: true }, // 'Admin Dashboard' or 'Autonomous Engine (Jules)'
  targetDomains: [{ type: String }],
});

const SeoTelemetryLog = mongoose.models.SeoTelemetryLog || mongoose.model('SeoTelemetryLog', SeoTelemetryLogSchema);

export default SeoTelemetryLog;
