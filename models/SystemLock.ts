import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemLock extends Document {
  lockName: string;
  activeProcesses: string[];
  lastUpdated: Date;
}

const SystemLockSchema: Schema = new Schema({
  lockName: { type: String, required: true, unique: true },
  activeProcesses: [{ type: String }],
  lastUpdated: { type: Date, default: Date.now },
});

export default mongoose.models.SystemLock || mongoose.model<ISystemLock>('SystemLock', SystemLockSchema);
