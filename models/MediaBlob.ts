import mongoose, { Schema, Document } from 'mongoose';

export interface IMediaBlob extends Document {
  filename: string;
  contentType: string;
  data: Buffer;
  ownerId: mongoose.Types.ObjectId;
  createdAt: Date;
}

const MediaBlobSchema: Schema = new Schema({
  filename: { type: String, required: true },
  contentType: { type: String, required: true },
  data: { type: Buffer, required: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now, expires: 604800 }, // Automatically deletes after 7 days (Google only needs it once)
});

export default mongoose.models.MediaBlob || mongoose.model<IMediaBlob>('MediaBlob', MediaBlobSchema);
