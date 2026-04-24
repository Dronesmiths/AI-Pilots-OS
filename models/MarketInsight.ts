import mongoose, { Schema, Document } from 'mongoose';

export interface IMarketInsight extends Document {
  user: mongoose.Types.ObjectId;
  keyword: string;
  impressions_surge: string;
  proposed_payload: string[];
  confidence_score: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: Date;
  updatedAt: Date;
}

const MarketInsightSchema: Schema = new Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    keyword: {
      type: String,
      required: true,
    },
    impressions_surge: {
      type: String, // visual identifier e.g., "+450%"
      required: false,
    },
    proposed_payload: [
      {
        type: String,
      }
    ],
    confidence_score: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    }
  },
  {
    timestamps: true,
  }
);

// Prevent mongoose from recompiling the model randomly during NextJS hot reloads
export default mongoose.models.MarketInsight || mongoose.model<IMarketInsight>('MarketInsight', MarketInsightSchema);
